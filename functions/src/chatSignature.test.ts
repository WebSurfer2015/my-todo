/**
 * Chat-turn signatures: each reply is signed as `${convId}.${iat}.${hmac}`,
 * bound to the caller's uid, a server-minted conversation id, the signing
 * time and the user turn it answered. A request only counts as a free
 * follow-up when its whole assistant history proves ONE live conversation
 * (claimFollowUp) AND that conversation is recorded for the uid
 * (resolveConversation, chatQuota.ts) — so fabricated, cross-user, stale,
 * spliced or prefix-replayed history takes a slot.
 */
import { createHash, createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  FOLLOW_UP_MAX_IDLE_MS,
  deriveChatSigKey,
  historyHash,
  isConvId,
  mintConvId,
  precedingUserText,
  signReply,
  signedPayload,
  verifiedConversation,
  verifyReplySig,
} from './chatSignature'
import { normalizeChatMessages, type ChatMessage } from './chatMessages'
import { DROPPED_OPS_REPLY, SYNTHESIZED_ACK, claimFollowUp } from './agentChatCore'
import {
  CONV_RECORD_TTL_MS,
  MAX_CONV_RECORDS,
  START_RETRY_WINDOW_MS,
  resolveConversation,
  type ConvRecord,
} from './chatQuota'

const key = deriveChatSigKey('sk-ant-test')
const UID = 'alice'
const CONV = 'AAAAAAAAAAAAAAAA'
const OTHER_CONV = 'BBBBBBBBBBBBBBBB'
const NOW = Date.UTC(2026, 9, 19, 12, 0, 0)
const NOW_S = NOW / 1000

describe('deriveChatSigKey / signReply', () => {
  it('key = sha256("sagely-chat-sig:" + apiKey); sig = convId.iat.base64url HMAC(uid|convId|iat|sha256(prev)|reply)', () => {
    const expectedKey = createHash('sha256').update('sagely-chat-sig:sk-ant-test').digest()
    expect(key.equals(expectedKey)).toBe(true)
    const prevHash = createHash('sha256').update('add milk').digest('hex')
    const payload = `alice|${CONV}|${NOW_S}|${prevHash}|Which store?`
    expect(signedPayload(UID, CONV, NOW_S, 'add milk', 'Which store?')).toBe(payload)
    const mac = createHmac('sha256', expectedKey).update(payload).digest('base64url')
    const sig = signReply(key, UID, CONV, NOW_S, 'add milk', 'Which store?')
    expect(sig).toBe(`${CONV}.${NOW_S}.${mac}`)
    // Fits the 128-char wire cap with room to spare.
    expect(sig.length).toBe(71)
  })
  it('different API keys give different signatures', () => {
    expect(signReply(deriveChatSigKey('other'), UID, CONV, 1, 'p', 'x')).not.toBe(
      signReply(key, UID, CONV, 1, 'p', 'x'),
    )
  })
  it('mintConvId: 96 random bits as 16 base64url chars, unique', () => {
    const a = mintConvId()
    expect(a).toMatch(/^[A-Za-z0-9_-]{16}$/)
    expect(isConvId(a)).toBe(true)
    expect(mintConvId()).not.toBe(a)
    expect(isConvId('short')).toBe(false)
    expect(isConvId(42)).toBe(false)
  })
})

describe('verifyReplySig', () => {
  const sig = signReply(key, UID, CONV, NOW_S, 'add milk', 'Which store?')
  it('returns the signed convId + iat for the same uid, predecessor and text', () => {
    expect(verifyReplySig(key, UID, 'add milk', 'Which store?', sig)).toEqual({ convId: CONV, iat: NOW_S })
  })
  it('rejects tampered text, a wrong/short/malformed sig, and non-strings', () => {
    expect(verifyReplySig(key, UID, 'add milk', 'Which store', sig)).toBeNull()
    const flipped = sig.slice(0, -1) + (sig.endsWith('A') ? 'B' : 'A')
    expect(verifyReplySig(key, UID, 'add milk', 'Which store?', flipped)).toBeNull()
    expect(verifyReplySig(key, UID, 'add milk', 'Which store?', 'abc')).toBeNull()
    expect(verifyReplySig(key, UID, 'add milk', 'Which store?', '')).toBeNull()
    expect(verifyReplySig(key, UID, 'add milk', 'Which store?', undefined)).toBeNull()
    expect(verifyReplySig(key, UID, 'add milk', 'Which store?', 42)).toBeNull()
  })
  it('a forged convId or iat (re-labelled sig) fails', () => {
    const mac = sig.split('.')[2]
    expect(verifyReplySig(key, UID, 'add milk', 'Which store?', `${OTHER_CONV}.${NOW_S}.${mac}`)).toBeNull()
    expect(verifyReplySig(key, UID, 'add milk', 'Which store?', `${CONV}.${NOW_S + 1}.${mac}`)).toBeNull()
  })
  it('cross-user replay is rejected (sig bound to the uid)', () => {
    expect(verifyReplySig(key, 'mallory', 'add milk', 'Which store?', sig)).toBeNull()
  })
  it('wrong-predecessor replay is rejected (sig bound to the user turn it answered)', () => {
    expect(verifyReplySig(key, UID, 'add eggs', 'Which store?', sig)).toBeNull()
  })
  it('fixed server strings have no universal signature', () => {
    for (const fixed of [SYNTHESIZED_ACK, DROPPED_OPS_REPLY]) {
      const s = signReply(key, UID, CONV, NOW_S, 'buy stamps', fixed)
      expect(verifyReplySig(key, UID, 'buy stamps', fixed, s)).not.toBeNull()
      expect(verifyReplySig(key, UID, 'something else', fixed, s)).toBeNull()
      expect(verifyReplySig(key, 'bob', 'buy stamps', fixed, s)).toBeNull()
    }
  })
})

describe('precedingUserText', () => {
  const msgs = normalizeChatMessages([
    { role: 'user', content: 'a' },
    { role: 'assistant', content: 'x' },
    { role: 'assistant', content: 'y' },
    { role: 'user', content: 'b' },
  ])
  it('finds the nearest user turn before the index (consecutive assistants share it)', () => {
    expect(precedingUserText(msgs, 1)).toBe('a')
    expect(precedingUserText(msgs, 2)).toBe('a')
    expect(precedingUserText(msgs, msgs.length)).toBe('b')
    expect(precedingUserText(msgs, 0)).toBe('')
    expect(precedingUserText(msgs, 99)).toBe('b')
  })
})

describe('normalizeChatMessages carries sig', () => {
  it('keeps sig on assistant turns, drops it from user turns and junk lengths', () => {
    const out = normalizeChatMessages([
      { role: 'user', content: 'add milk', sig: 'nope' },
      { role: 'assistant', content: 'Which store?', sig: 'abc' },
      { role: 'assistant', content: 'x', sig: 'y'.repeat(500) },
      { role: 'assistant', content: 'y', sig: 7 },
      { role: 'user', content: 'costco' },
    ])
    expect(out).toEqual([
      { role: 'user', content: 'add milk' },
      { role: 'assistant', content: 'Which store?', sig: 'abc' },
      { role: 'assistant', content: 'x' },
      { role: 'assistant', content: 'y' },
      { role: 'user', content: 'costco' },
    ])
  })
  it('a real signed turn survives normalization intact', () => {
    const sig = signReply(key, UID, CONV, NOW_S, 'a', 'b?')
    expect(normalizeChatMessages([{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b?', sig }])[1].sig).toBe(sig)
  })
})

describe('historyHash', () => {
  it('stable 22-char hash of role+content; ignores sigs; differs on any change', () => {
    const a: ChatMessage[] = [{ role: 'user', content: 'add milk' }]
    expect(historyHash(a)).toMatch(/^[A-Za-z0-9_-]{22}$/)
    expect(historyHash([{ role: 'user', content: 'add milk' }])).toBe(historyHash(a))
    expect(historyHash([{ role: 'user', content: 'add eggs' }])).not.toBe(historyHash(a))
    const withSig: ChatMessage[] = [{ role: 'user', content: 'x' }, { role: 'assistant', content: 'y', sig: 's1' }]
    const otherSig: ChatMessage[] = [{ role: 'user', content: 'x' }, { role: 'assistant', content: 'y', sig: 's2' }]
    expect(historyHash(withSig)).toBe(historyHash(otherSig))
  })
})

// ─── The fair-use slot rule, both halves ─────────────────────────────

/** A signed assistant turn answering `prev`, in conversation `conv`, signed at `iatS`. */
const signed = (prev: string, content: string, opts: { conv?: string; iatS?: number; uid?: string } = {}) => ({
  role: 'assistant' as const,
  content,
  sig: signReply(key, opts.uid ?? UID, opts.conv ?? CONV, opts.iatS ?? NOW_S - 30, prev, content),
})
const rec = (id: string, t: number, h = 'h'): ConvRecord => ({ id, t, h })
let n = 0
const mint = () => `MINTED${String(++n).padStart(10, '0')}`

/** Full decision: client claim → server recorded-list check. True = takes a slot. */
function takesSlot(messages: ChatMessage[], convs: ConvRecord[], opts: { uid?: string; now?: number; flag?: unknown } = {}) {
  const now = opts.now ?? NOW
  const claim = claimFollowUp(opts.flag, messages, key, opts.uid ?? UID, now)
  return resolveConversation(convs, claim, historyHash(messages), now, mint).startsConversation
}

describe('claimFollowUp / verifiedConversation (client-claim half)', () => {
  const followUp = normalizeChatMessages([
    { role: 'user', content: 'add milk' },
    signed('add milk', 'Which store?'),
    { role: 'user', content: 'costco' },
  ])

  it('a fully-signed, fresh, single-conversation follow-up claims its convId', () => {
    expect(claimFollowUp(undefined, followUp, key, UID, NOW)).toBe(CONV)
  })
  it('one user turn, or the client flag, is always a start', () => {
    expect(claimFollowUp(undefined, normalizeChatMessages([{ role: 'user', content: 'hi' }]), key, UID, NOW)).toBeNull()
    expect(claimFollowUp(true, followUp, key, UID, NOW)).toBeNull()
    // Only a literal `true` counts as the flag.
    expect(claimFollowUp('true', followUp, key, UID, NOW)).toBe(CONV)
  })
  it('two user turns with NO assistant turn proves nothing → start', () => {
    const noAssistant: ChatMessage[] = [
      { role: 'user', content: 'a' },
      { role: 'user', content: 'b' },
    ]
    expect(verifiedConversation(noAssistant, key, UID, NOW)).toBeNull()
  })
  it('expired: newest reply older than 60 min → start; exactly 60 min still ok', () => {
    const at = (iatS: number) =>
      normalizeChatMessages([{ role: 'user', content: 'a' }, signed('a', 'b?', { iatS }), { role: 'user', content: 'c' }])
    const limitS = FOLLOW_UP_MAX_IDLE_MS / 1000
    expect(claimFollowUp(undefined, at(NOW_S - limitS), key, UID, NOW)).toBe(CONV)
    expect(claimFollowUp(undefined, at(NOW_S - limitS - 1), key, UID, NOW)).toBeNull()
    // Implausibly far in the future (> 5 min skew) → not trusted.
    expect(claimFollowUp(undefined, at(NOW_S + 301), key, UID, NOW)).toBeNull()
    expect(claimFollowUp(undefined, at(NOW_S + 300), key, UID, NOW)).toBe(CONV)
  })
  it('the NEWEST iat decides freshness (an old first reply is fine)', () => {
    const msgs = normalizeChatMessages([
      { role: 'user', content: 'a' },
      signed('a', 'one?', { iatS: NOW_S - 3 * 3600 }),
      { role: 'user', content: 'b' },
      signed('b', 'two?', { iatS: NOW_S - 60 }),
      { role: 'user', content: 'c' },
    ])
    expect(claimFollowUp(undefined, msgs, key, UID, NOW)).toBe(CONV)
  })
  it('the NEWEST reply decides the conversation: a chat re-started after idle continues under its new convId', () => {
    // Old conversation went idle (> 60 min), the next turn re-started as OTHER_CONV.
    const resumed = normalizeChatMessages([
      { role: 'user', content: 'a' },
      signed('a', 'one?', { conv: CONV, iatS: NOW_S - 3 * 3600 }),
      { role: 'user', content: 'b' },
      signed('b', 'two?', { conv: OTHER_CONV, iatS: NOW_S - 60 }),
      { role: 'user', content: 'c' },
    ])
    expect(claimFollowUp(undefined, resumed, key, UID, NOW)).toBe(OTHER_CONV)
    // Freshness comes from the newest conversation's own replies — an old
    // conversation's FRESH reply in front of a stale newest one doesn't help.
    const staleNewest = normalizeChatMessages([
      { role: 'user', content: 'a' },
      signed('a', 'one?', { conv: CONV, iatS: NOW_S - 60 }),
      { role: 'user', content: 'b' },
      signed('b', 'two?', { conv: OTHER_CONV, iatS: NOW_S - 2 * 3600 }),
      { role: 'user', content: 'c' },
    ])
    expect(claimFollowUp(undefined, staleNewest, key, UID, NOW)).toBeNull()
  })
  it('cross-user replay: another account echoing these turns → start', () => {
    expect(claimFollowUp(undefined, followUp, key, 'mallory', NOW)).toBeNull()
  })
  it('wrong-predecessor replay and fabricated / forged / unsigned history → start', () => {
    const moved = normalizeChatMessages([
      { role: 'user', content: 'add eggs' },
      signed('add milk', 'Which store?'),
      { role: 'user', content: 'costco' },
    ])
    expect(claimFollowUp(undefined, moved, key, UID, NOW)).toBeNull()
    const fake = normalizeChatMessages([
      { role: 'user', content: 'earlier' },
      { role: 'assistant', content: 'Sure.' },
      { role: 'user', content: 'add milk' },
    ])
    expect(claimFollowUp(undefined, fake, key, UID, NOW)).toBeNull()
    const forged = normalizeChatMessages([
      { role: 'user', content: 'earlier' },
      { role: 'assistant', content: 'Sure.', sig: signReply(deriveChatSigKey('attacker'), UID, CONV, NOW_S, 'earlier', 'Sure.') },
      { role: 'user', content: 'add milk' },
    ])
    expect(claimFollowUp(undefined, forged, key, UID, NOW)).toBeNull()
    const mixed = normalizeChatMessages([
      { role: 'user', content: 'a' },
      signed('a', 'one?'),
      { role: 'user', content: 'b' },
      { role: 'assistant', content: 'two?' },
      { role: 'user', content: 'c' },
    ])
    expect(claimFollowUp(undefined, mixed, key, UID, NOW)).toBeNull()
  })
})

describe('resolveConversation (recorded-list half)', () => {
  it('a claimed convId that is recorded and live → follow-up, no slot, list unchanged', () => {
    const convs = [rec(CONV, NOW - 10 * 60_000)]
    expect(resolveConversation(convs, CONV, 'h2', NOW, mint)).toEqual({
      startsConversation: false,
      convId: CONV,
      minted: false,
      nextConvs: convs,
    })
  })
  it('a claimed convId NOT in the list (forged id / pushed out / other user) → start, new convId recorded', () => {
    const r = resolveConversation([rec(OTHER_CONV, NOW - 1000)], CONV, 'hx', NOW, () => 'NEWCONVNEWCONV00')
    expect(r.startsConversation).toBe(true)
    expect(r.minted).toBe(true)
    expect(r.convId).toBe('NEWCONVNEWCONV00')
    expect(r.nextConvs).toEqual([rec(OTHER_CONV, NOW - 1000), { id: 'NEWCONVNEWCONV00', t: NOW, h: 'hx' }])
  })
  it('records older than 24h are dropped — a claim on one is a start (rolling window, not reset at UTC midnight)', () => {
    const old = rec(CONV, NOW - CONV_RECORD_TTL_MS)
    const recent = rec(OTHER_CONV, NOW - CONV_RECORD_TTL_MS + 1)
    const r = resolveConversation([old, recent], CONV, 'h', NOW, mint)
    expect(r.startsConversation).toBe(true)
    expect(r.nextConvs.map((c) => c.id)).not.toContain(CONV)
    expect(r.nextConvs.map((c) => c.id)).toContain(OTHER_CONV)
    // Yesterday-23:50 conversation continued at 00:10 → still a follow-up.
    const lateNight = Date.UTC(2026, 9, 18, 23, 50)
    const afterMidnight = Date.UTC(2026, 9, 19, 0, 10)
    expect(resolveConversation([rec(CONV, lateNight)], CONV, 'h', afterMidnight, mint).startsConversation).toBe(false)
  })
  it('the list is capped at MAX_CONV_RECORDS, newest kept', () => {
    const many = Array.from({ length: MAX_CONV_RECORDS }, (_, i) => rec(`C${String(i).padStart(15, '0')}`, NOW - 1000 + i, `h${i}`))
    const r = resolveConversation(many, null, 'fresh', NOW, () => 'ZZZZZZZZZZZZZZZZ')
    expect(r.nextConvs).toHaveLength(MAX_CONV_RECORDS)
    expect(r.nextConvs[0].id).toBe(many[1].id)
    expect(r.nextConvs.at(-1)?.id).toBe('ZZZZZZZZZZZZZZZZ')
  })
  it('start RETRY: same history within 2 min reuses the convId without a slot; after 2 min it is a new start', () => {
    const convs = [rec(CONV, NOW - START_RETRY_WINDOW_MS + 1, 'same')]
    expect(resolveConversation(convs, null, 'same', NOW, mint)).toMatchObject({
      startsConversation: false,
      convId: CONV,
      minted: false,
    })
    expect(resolveConversation(convs, null, 'different', NOW, mint).startsConversation).toBe(true)
    const stale = [rec(CONV, NOW - START_RETRY_WINDOW_MS, 'same')]
    expect(resolveConversation(stale, null, 'same', NOW, mint).startsConversation).toBe(true)
  })
})

describe('end to end: the round-3 replay cases', () => {
  const recorded = [rec(CONV, NOW - 20 * 60_000)]

  it('valid follow-up → no slot', () => {
    const msgs = normalizeChatMessages([{ role: 'user', content: 'u1' }, signed('u1', 'a1?'), { role: 'user', content: 'u2' }])
    expect(takesSlot(msgs, recorded)).toBe(false)
  })
  it('PREFIX REPLAY of a previous conversation ([u1, a1+sig, uNew], flag false) → new conversation', () => {
    // A previous conversation: minted 3h ago, last reply 2h ago, still recorded.
    const prev = [rec(CONV, NOW - 3 * 3600_000)]
    const replay = normalizeChatMessages([
      { role: 'user', content: 'u1' },
      signed('u1', 'a1?', { iatS: NOW_S - 2 * 3600 }),
      { role: 'user', content: 'something new' },
    ])
    expect(takesSlot(replay, prev)).toBe(true)
    // …and once the record has aged out, even a fresh-looking sig doesn't help.
    const aged = [rec(CONV, NOW - CONV_RECORD_TTL_MS - 1)]
    const fresh = normalizeChatMessages([{ role: 'user', content: 'u1' }, signed('u1', 'a1?'), { role: 'user', content: 'new' }])
    expect(takesSlot(fresh, aged)).toBe(true)
  })
  it('expired iat → new', () => {
    const msgs = normalizeChatMessages([
      { role: 'user', content: 'u1' },
      signed('u1', 'a1?', { iatS: NOW_S - 61 * 60 }),
      { role: 'user', content: 'u2' },
    ])
    expect(takesSlot(msgs, recorded)).toBe(true)
  })
  it('forged convId (validly signed for an id the server never recorded) → new', () => {
    const msgs = normalizeChatMessages([
      { role: 'user', content: 'u1' },
      signed('u1', 'a1?', { conv: OTHER_CONV }),
      { role: 'user', content: 'u2' },
    ])
    expect(takesSlot(msgs, recorded)).toBe(true)
  })
  it('cross-user → new (sig bound to uid; and the list is per-user)', () => {
    const msgs = normalizeChatMessages([{ role: 'user', content: 'u1' }, signed('u1', 'a1?'), { role: 'user', content: 'u2' }])
    expect(takesSlot(msgs, [], { uid: 'mallory' })).toBe(true)
    expect(takesSlot(msgs, recorded, { uid: 'mallory' })).toBe(true)
  })
  it('no lock-in: after a stale replay re-starts, the next turn of THAT chat is free', () => {
    const NEW = 'NNNNNNNNNNNNNNNN'
    const msgs = normalizeChatMessages([
      { role: 'user', content: 'u1' },
      signed('u1', 'a1?', { iatS: NOW_S - 2 * 3600 }),
      { role: 'user', content: 'u2' },
      signed('u2', 'a2?', { conv: NEW, iatS: NOW_S - 30 }),
      { role: 'user', content: 'u3' },
    ])
    expect(takesSlot(msgs, [rec(NEW, NOW - 60_000)])).toBe(false)
  })
  it('client flag always starts (unless it is a retry of the same start)', () => {
    const msgs = normalizeChatMessages([{ role: 'user', content: 'u1' }, signed('u1', 'a1?'), { role: 'user', content: 'u2' }])
    expect(takesSlot(msgs, recorded, { flag: true })).toBe(true)
  })
})
