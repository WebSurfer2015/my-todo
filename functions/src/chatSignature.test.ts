/**
 * Chat-turn signatures: each reply is signed as `${convId}.${iat}.${hmac}`,
 * bound to the caller's uid, a server-minted conversation id, the signing
 * time and the user turn it answered. A request only counts as a free
 * follow-up when its newest assistant turn proves a live conversation
 * (claimFollowUp) AND that conversation is recorded for the uid with
 * follow-ups left
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
  MAX_CHAT_TURNS_PER_DAY,
  MAX_CONV_RECORDS,
  MAX_TURNS_PER_CONVERSATION,
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
/** A recorded conversation minted (and last used) at `t`. */
const rec = (id: string, t: number, h = 'h', over: Partial<ConvRecord> = {}): ConvRecord => ({
  id,
  t,
  u: t,
  h,
  n: 0,
  r: 0,
  ...over,
})
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
  it('only the NEWEST reply is checked: older unverifiable turns (e.g. signed before a key rotation) are ignored', () => {
    const rotated = normalizeChatMessages([
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'one?', sig: signReply(deriveChatSigKey('old-api-key'), UID, CONV, NOW_S - 600, 'a', 'one?') },
      { role: 'user', content: 'b' },
      signed('b', 'two?', { conv: OTHER_CONV, iatS: NOW_S - 30 }),
      { role: 'user', content: 'c' },
    ])
    expect(claimFollowUp(undefined, rotated, key, UID, NOW)).toBe(OTHER_CONV)
    // …and an unsigned / fabricated prefix in front of a live signed reply too.
    const fabricatedPrefix = normalizeChatMessages([
      { role: 'user', content: 'x' },
      { role: 'assistant', content: 'made up' },
      { role: 'user', content: 'b' },
      signed('b', 'two?'),
      { role: 'user', content: 'c' },
    ])
    expect(claimFollowUp(undefined, fabricatedPrefix, key, UID, NOW)).toBe(CONV)
  })
  it("freshness is the newest reply's OWN iat — an older, fresher reply of the same conversation can't refresh it", () => {
    const reordered = normalizeChatMessages([
      { role: 'user', content: 'a' },
      signed('a', 'one?', { iatS: NOW_S - 60 }),
      { role: 'user', content: 'b' },
      signed('b', 'two?', { iatS: NOW_S - 2 * 3600 }),
      { role: 'user', content: 'c' },
    ])
    expect(claimFollowUp(undefined, reordered, key, UID, NOW)).toBeNull()
  })
})

describe('resolveConversation (recorded-list half)', () => {
  const HOUR = 3600_000
  it('constants: 24h idle TTL, ≥ a full day of starts recorded, 30 follow-ups per conversation', () => {
    expect(CONV_RECORD_TTL_MS).toBe(24 * HOUR)
    expect(MAX_CONV_RECORDS).toBe(120)
    expect(MAX_CONV_RECORDS).toBeGreaterThanOrEqual(MAX_CHAT_TURNS_PER_DAY)
    expect(MAX_TURNS_PER_CONVERSATION).toBe(30)
  })
  it('a claimed convId that is recorded and live → follow-up, no slot; its record is counted (n+1), stamped (u) and moved to the end', () => {
    const mine = rec(CONV, NOW - 10 * 60_000, 'h', { n: 3 })
    const other = rec(OTHER_CONV, NOW - 5 * 60_000)
    expect(resolveConversation([mine, other], CONV, 'h2', NOW, mint)).toEqual({
      startsConversation: false,
      convId: CONV,
      minted: false,
      followUp: true,
      nextConvs: [other, { ...mine, n: 4, u: NOW }],
    })
  })
  it('a claimed convId NOT in the list (forged id / pushed out / other user) → start, new convId recorded', () => {
    const r = resolveConversation([rec(OTHER_CONV, NOW - 1000)], CONV, 'hx', NOW, () => 'NEWCONVNEWCONV00')
    expect(r).toMatchObject({ startsConversation: true, minted: true, followUp: false, convId: 'NEWCONVNEWCONV00' })
    expect(r.nextConvs).toEqual([rec(OTHER_CONV, NOW - 1000), rec('NEWCONVNEWCONV00', NOW, 'hx')])
  })
  it('expiry runs from LAST USE: idle 24h + 1ms → start; minted 30h ago but used 23h ago → still a follow-up', () => {
    const idle = rec(CONV, NOW - 30 * HOUR, 'h', { u: NOW - (24 * HOUR + 1) })
    const r = resolveConversation([idle], CONV, 'h', NOW, mint)
    expect(r.startsConversation).toBe(true)
    expect(r.nextConvs.map((c) => c.id)).not.toContain(CONV)
    const used = rec(CONV, NOW - 30 * HOUR, 'h', { u: NOW - 23 * HOUR })
    expect(resolveConversation([used], CONV, 'h', NOW, mint)).toMatchObject({ startsConversation: false, followUp: true })
    // Exactly 24h idle is expired; 1ms less is live.
    expect(resolveConversation([rec(CONV, NOW - 24 * HOUR)], CONV, 'h', NOW, mint).startsConversation).toBe(true)
    expect(resolveConversation([rec(CONV, NOW - 24 * HOUR + 1)], CONV, 'h', NOW, mint).startsConversation).toBe(false)
    // Rolling, not reset at UTC midnight: yesterday-23:50 conversation continued at 00:10.
    const lateNight = Date.UTC(2026, 9, 18, 23, 50)
    const afterMidnight = Date.UTC(2026, 9, 19, 0, 10)
    expect(resolveConversation([rec(CONV, lateNight)], CONV, 'h', afterMidnight, mint).startsConversation).toBe(false)
  })
  it('per-conversation turn cap: follow-up #30 is free, #31 is a NEW conversation (slot, fresh convId)', () => {
    const at29 = resolveConversation([rec(CONV, NOW - HOUR, 'h', { n: 29 })], CONV, 'x', NOW, mint)
    expect(at29).toMatchObject({ startsConversation: false, followUp: true, convId: CONV })
    expect(at29.nextConvs[0].n).toBe(MAX_TURNS_PER_CONVERSATION)
    const capped = rec(CONV, NOW - HOUR, 'h', { n: MAX_TURNS_PER_CONVERSATION })
    const over = resolveConversation([capped], CONV, 'x', NOW, () => 'FRESHFRESHFRESH0')
    expect(over).toMatchObject({ startsConversation: true, minted: true, followUp: false, convId: 'FRESHFRESHFRESH0' })
    // The capped record is left as-is (it just ages out); the new one starts at 0.
    expect(over.nextConvs).toEqual([capped, rec('FRESHFRESHFRESH0', NOW, 'x')])
    // …and the continued chat is free again under the fresh convId.
    expect(resolveConversation(over.nextConvs, 'FRESHFRESHFRESH0', 'y', NOW + 1000, mint).startsConversation).toBe(false)
  })
  it('the list is capped at MAX_CONV_RECORDS, LEAST RECENTLY USED evicted', () => {
    const many = Array.from({ length: MAX_CONV_RECORDS }, (_, i) => rec(`C${String(i).padStart(15, '0')}`, NOW - 1000 + i, `h${i}`))
    // The OLDEST-minted conversation is still in use: a follow-up moves it to the end…
    const used = resolveConversation(many, many[0].id, 'fu', NOW, mint)
    expect(used.nextConvs.at(-1)?.id).toBe(many[0].id)
    // …so the next start evicts the least recently used one instead (many[1]).
    const r = resolveConversation(used.nextConvs, null, 'fresh', NOW + 1, () => 'ZZZZZZZZZZZZZZZZ')
    expect(r.nextConvs).toHaveLength(MAX_CONV_RECORDS)
    expect(r.nextConvs.map((c) => c.id)).toContain(many[0].id)
    expect(r.nextConvs.map((c) => c.id)).not.toContain(many[1].id)
    expect(r.nextConvs.at(-1)?.id).toBe('ZZZZZZZZZZZZZZZZ')
  })
  it('start RETRY: same history within 2 min (from MINT) reuses the convId without a slot, counting the reuse (r+1); after 2 min it is a new start', () => {
    const convs = [rec(CONV, NOW - START_RETRY_WINDOW_MS + 1, 'same')]
    const retry = resolveConversation(convs, null, 'same', NOW, mint)
    expect(retry).toMatchObject({ startsConversation: false, convId: CONV, minted: false, followUp: false })
    expect(retry.nextConvs).toEqual([{ ...convs[0], r: 1, u: NOW }])
    expect(resolveConversation(convs, null, 'different', NOW, mint).startsConversation).toBe(true)
    const stale = [rec(CONV, NOW - START_RETRY_WINDOW_MS, 'same')]
    expect(resolveConversation(stale, null, 'same', NOW, mint).startsConversation).toBe(true)
    // A recent USE doesn't extend the retry window — it runs from the mint.
    const usedSince = [rec(CONV, NOW - START_RETRY_WINDOW_MS, 'same', { u: NOW - 1000 })]
    expect(resolveConversation(usedSince, null, 'same', NOW, mint).startsConversation).toBe(true)
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
  it('FORKING one live conversation: free for MAX_TURNS_PER_CONVERSATION requests, then each costs a slot', () => {
    // A tampered client keeps one reply fresh and sends every new request as
    // [u1, a1+sig, uNew] — distinct histories, so no retry de-dup.
    let convs = [rec(CONV, NOW - 60_000)]
    const fork = (i: number) =>
      normalizeChatMessages([{ role: 'user', content: 'u1' }, signed('u1', 'a1?'), { role: 'user', content: `new ${i}` }])
    let slots = 0
    for (let i = 0; i < MAX_TURNS_PER_CONVERSATION + 3; i++) {
      const m = fork(i)
      const r = resolveConversation(convs, claimFollowUp(undefined, m, key, UID, NOW), historyHash(m), NOW, mint)
      if (r.startsConversation) slots++
      convs = r.nextConvs
    }
    expect(slots).toBe(3)
  })
})
