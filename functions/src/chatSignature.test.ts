/**
 * Chat-turn signatures: the server signs each reply; a request whose
 * assistant history isn't fully signed counts as a conversation START (takes
 * a fair-use slot) — so fabricated history can't dodge the slot.
 */
import { createHash, createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  deriveChatSigKey,
  hasUnsignedAssistantTurn,
  signReply,
  verifyReplySig,
} from './chatSignature'
import { normalizeChatMessages } from './chatMessages'
import { startsConversation } from './agentChatCore'

const key = deriveChatSigKey('sk-ant-test')

describe('deriveChatSigKey / signReply', () => {
  it('key = sha256("sagely-chat-sig:" + apiKey); sig = base64url HMAC-SHA256(reply)', () => {
    const expectedKey = createHash('sha256').update('sagely-chat-sig:sk-ant-test').digest()
    expect(key.equals(expectedKey)).toBe(true)
    const expectedSig = createHmac('sha256', expectedKey).update('Which store?').digest('base64url')
    expect(signReply(key, 'Which store?')).toBe(expectedSig)
    expect(signReply(key, 'Which store?')).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })
  it('different API keys give different signatures', () => {
    expect(signReply(deriveChatSigKey('other'), 'x')).not.toBe(signReply(key, 'x'))
  })
})

describe('verifyReplySig', () => {
  const sig = signReply(key, 'Which store?')
  it('accepts our signature over the exact text', () => {
    expect(verifyReplySig(key, 'Which store?', sig)).toBe(true)
  })
  it('rejects tampered text, a wrong/short sig, and non-strings', () => {
    expect(verifyReplySig(key, 'Which store', sig)).toBe(false)
    expect(verifyReplySig(key, 'Which store?', sig.slice(0, -1) + (sig.endsWith('A') ? 'B' : 'A'))).toBe(false)
    expect(verifyReplySig(key, 'Which store?', 'abc')).toBe(false)
    expect(verifyReplySig(key, 'Which store?', '')).toBe(false)
    expect(verifyReplySig(key, 'Which store?', undefined)).toBe(false)
    expect(verifyReplySig(key, 'Which store?', 42)).toBe(false)
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
  const signed = (content: string) => ({ role: 'assistant' as const, content, sig: signReply(key, content) })
  const followUp = normalizeChatMessages([
    { role: 'user', content: 'add milk' },
    signed('Which store?'),
    { role: 'user', content: 'costco' },
  ])

  it('a fully-signed follow-up is free', () => {
    expect(hasUnsignedAssistantTurn(followUp, key)).toBe(false)
    expect(startsConversation(undefined, followUp, key)).toBe(false)
  })
  it('one user turn, or the client flag, starts a conversation', () => {
    expect(startsConversation(undefined, normalizeChatMessages([{ role: 'user', content: 'hi' }]), key)).toBe(true)
    expect(startsConversation(true, followUp, key)).toBe(true)
    // Only a literal `true` counts as the flag.
    expect(startsConversation('true', followUp, key)).toBe(false)
  })
  it('fabricated (unsigned / forged) history takes a slot', () => {
    const fake = normalizeChatMessages([
      { role: 'user', content: 'earlier' },
      { role: 'assistant', content: 'Sure.' },
      { role: 'user', content: 'add milk' },
    ])
    expect(startsConversation(undefined, fake, key)).toBe(true)
    const forged = normalizeChatMessages([
      { role: 'user', content: 'earlier' },
      { role: 'assistant', content: 'Sure.', sig: signReply(deriveChatSigKey('attacker'), 'Sure.') },
      { role: 'user', content: 'add milk' },
    ])
    expect(startsConversation(undefined, forged, key)).toBe(true)
  })
  it('ANY unsigned assistant turn in the window is enough', () => {
    const mixed = normalizeChatMessages([
      { role: 'user', content: 'a' },
      signed('one?'),
      { role: 'user', content: 'b' },
      { role: 'assistant', content: 'two?' },
      { role: 'user', content: 'c' },
    ])
    expect(startsConversation(undefined, mixed, key)).toBe(true)
  })
})
