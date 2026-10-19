/**
 * Chat-turn signatures: the server signs each reply bound to the caller's uid
 * and the user turn it answered; a request whose assistant history isn't
 * fully signed (for this uid + predecessor) counts as a conversation START
 * (takes a fair-use slot) — so fabricated OR replayed history can't dodge it.
 */
import { createHash, createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  deriveChatSigKey,
  hasUnsignedAssistantTurn,
  precedingUserText,
  signReply,
  signedPayload,
  verifyReplySig,
} from './chatSignature'
import { normalizeChatMessages } from './chatMessages'
import { DROPPED_OPS_REPLY, SYNTHESIZED_ACK, startsConversation } from './agentChatCore'

const key = deriveChatSigKey('sk-ant-test')
const UID = 'alice'

describe('deriveChatSigKey / signReply', () => {
  it('key = sha256("sagely-chat-sig:" + apiKey); sig = base64url HMAC-SHA256(uid|sha256(prev)|reply)', () => {
    const expectedKey = createHash('sha256').update('sagely-chat-sig:sk-ant-test').digest()
    expect(key.equals(expectedKey)).toBe(true)
    const prevHash = createHash('sha256').update('add milk').digest('hex')
    expect(signedPayload(UID, 'add milk', 'Which store?')).toBe(`alice|${prevHash}|Which store?`)
    const expectedSig = createHmac('sha256', expectedKey)
      .update(`alice|${prevHash}|Which store?`)
      .digest('base64url')
    expect(signReply(key, UID, 'add milk', 'Which store?')).toBe(expectedSig)
    expect(signReply(key, UID, 'add milk', 'Which store?')).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })
  it('different API keys give different signatures', () => {
    expect(signReply(deriveChatSigKey('other'), UID, 'p', 'x')).not.toBe(signReply(key, UID, 'p', 'x'))
  })
})

describe('verifyReplySig', () => {
  const sig = signReply(key, UID, 'add milk', 'Which store?')
  it('accepts our signature for the same uid, predecessor and text', () => {
    expect(verifyReplySig(key, UID, 'add milk', 'Which store?', sig)).toBe(true)
  })
  it('rejects tampered text, a wrong/short sig, and non-strings', () => {
    expect(verifyReplySig(key, UID, 'add milk', 'Which store', sig)).toBe(false)
    expect(verifyReplySig(key, UID, 'add milk', 'Which store?', sig.slice(0, -1) + (sig.endsWith('A') ? 'B' : 'A'))).toBe(false)
    expect(verifyReplySig(key, UID, 'add milk', 'Which store?', 'abc')).toBe(false)
    expect(verifyReplySig(key, UID, 'add milk', 'Which store?', '')).toBe(false)
    expect(verifyReplySig(key, UID, 'add milk', 'Which store?', undefined)).toBe(false)
    expect(verifyReplySig(key, UID, 'add milk', 'Which store?', 42)).toBe(false)
  })
  it('cross-user replay is rejected (sig bound to the uid)', () => {
    expect(verifyReplySig(key, 'mallory', 'add milk', 'Which store?', sig)).toBe(false)
  })
  it('wrong-predecessor replay is rejected (sig bound to the user turn it answered)', () => {
    expect(verifyReplySig(key, UID, 'add eggs', 'Which store?', sig)).toBe(false)
  })
  it('fixed server strings have no universal signature', () => {
    for (const fixed of [SYNTHESIZED_ACK, DROPPED_OPS_REPLY]) {
      const s = signReply(key, UID, 'buy stamps', fixed)
      expect(verifyReplySig(key, UID, 'buy stamps', fixed, s)).toBe(true)
      expect(verifyReplySig(key, UID, 'something else', fixed, s)).toBe(false)
      expect(verifyReplySig(key, 'bob', 'buy stamps', fixed, s)).toBe(false)
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
})

describe('startsConversation (fair-use slot rule)', () => {
  const signedAfter = (prev: string, content: string, uid = UID) => ({
    role: 'assistant' as const,
    content,
    sig: signReply(key, uid, prev, content),
  })
  const followUp = normalizeChatMessages([
    { role: 'user', content: 'add milk' },
    signedAfter('add milk', 'Which store?'),
    { role: 'user', content: 'costco' },
  ])

  it('a fully-signed follow-up (same uid, correct predecessor) is free', () => {
    expect(hasUnsignedAssistantTurn(followUp, key, UID)).toBe(false)
    expect(startsConversation(undefined, followUp, key, UID)).toBe(false)
  })
  it('one user turn, or the client flag, starts a conversation', () => {
    expect(startsConversation(undefined, normalizeChatMessages([{ role: 'user', content: 'hi' }]), key, UID)).toBe(true)
    expect(startsConversation(true, followUp, key, UID)).toBe(true)
    // Only a literal `true` counts as the flag.
    expect(startsConversation('true', followUp, key, UID)).toBe(false)
  })
  it('cross-user replay: another account echoing these turns takes a slot', () => {
    expect(startsConversation(undefined, followUp, key, 'mallory')).toBe(true)
  })
  it('wrong-predecessor replay: a signed reply moved after a different user turn takes a slot', () => {
    const moved = normalizeChatMessages([
      { role: 'user', content: 'add eggs' },
      signedAfter('add milk', 'Which store?'),
      { role: 'user', content: 'costco' },
    ])
    expect(startsConversation(undefined, moved, key, UID)).toBe(true)
    // A universal-looking ack replayed into a fabricated history.
    const ack = signedAfter('buy stamps', SYNTHESIZED_ACK)
    const fake = normalizeChatMessages([
      { role: 'user', content: 'earlier' },
      ack,
      { role: 'user', content: 'add milk' },
    ])
    expect(startsConversation(undefined, fake, key, UID)).toBe(true)
  })
  it('fabricated (unsigned / forged) history takes a slot', () => {
    const fake = normalizeChatMessages([
      { role: 'user', content: 'earlier' },
      { role: 'assistant', content: 'Sure.' },
      { role: 'user', content: 'add milk' },
    ])
    expect(startsConversation(undefined, fake, key, UID)).toBe(true)
    const forged = normalizeChatMessages([
      { role: 'user', content: 'earlier' },
      { role: 'assistant', content: 'Sure.', sig: signReply(deriveChatSigKey('attacker'), UID, 'earlier', 'Sure.') },
      { role: 'user', content: 'add milk' },
    ])
    expect(startsConversation(undefined, forged, key, UID)).toBe(true)
  })
  it('ANY unsigned assistant turn in the window is enough', () => {
    const mixed = normalizeChatMessages([
      { role: 'user', content: 'a' },
      signedAfter('a', 'one?'),
      { role: 'user', content: 'b' },
      { role: 'assistant', content: 'two?' },
      { role: 'user', content: 'c' },
    ])
    expect(startsConversation(undefined, mixed, key, UID)).toBe(true)
  })
})
