/**
 * Pure accounting for Mochi (agentChat) fair use — no firebase-admin, so it is
 * unit-testable. quota.ts wraps these in Firestore transactions.
 *
 * The fair-use unit is a CONVERSATION (one capture), not a turn: only the
 * request that starts a conversation (exactly one user turn in the normalized
 * window) reserves a slot. Follow-up turns are free, bounded by
 *  - the 40-turn window (chatMessages.ts MAX_TURNS) per conversation, and
 *  - MAX_CHAT_TURNS_PER_DAY total turns per uid per UTC day — an anti-abuse
 *    backstop so a client can't run unlimited turns by never starting a new
 *    conversation (e.g. replaying a fake history).
 *
 * Usage lives in users/{uid}/state/agentUsage (server-only). Shape below; the
 * `chat*` / `ceilingHit` fields are per-UTC-day and reset with `date`. On a
 * day rollover the previous day's Mochi stats move to `prev` so the daily
 * metrics roll-up (which runs the next morning) still sees them even if the
 * user has already used AI again today.
 */

import { decideMochiReservation, type MochiUsageDoc } from './mochiReservation'
import type { Tier } from './entitlements'
import type { ChatMessage } from './chatMessages'

/** Anti-abuse backstop on TOTAL agentChat turns per uid per UTC day —
 * far above a real person's use (15 conversations × a few follow-ups), and
 * the hard per-user cost bound (~100 × $0.005 ≈ $0.50/day). */
export const MAX_CHAT_TURNS_PER_DAY = 100

/** One day's Mochi stats (what the metrics roll-up reads). */
export interface ChatDayStats {
  date: string
  chatTurns: number
  chatConversations: number
  ceilingHit: boolean
}

export interface AgentUsageData {
  /** UTC day, YYYY-MM-DD. */
  date: string
  /** Flat daily-cap slots used (aiInfer calls + Mochi conversations). */
  calls: number
  /** Mochi turns allowed today (every turn, conversation start or not). */
  chatTurns: number
  /** Mochi conversations started today. */
  chatConversations: number
  /** A Mochi reservation was rejected (fair-use ceiling) today. */
  ceilingHit: boolean
  /** The previous active day's Mochi stats, kept for the metrics roll-up. */
  prev?: ChatDayStats
}

/** True when this request STARTS a conversation (exactly one user turn in
 * the normalized window). Only these reserve a fair-use slot. */
export function isConversationStart(messages: ChatMessage[]): boolean {
  return messages.filter((m) => m.role === 'user').length === 1
}

function hasChatActivity(u: AgentUsageData): boolean {
  return u.chatTurns > 0 || u.chatConversations > 0 || u.ceilingHit
}

/** Normalize the stored usage to `today`: same day → as-is; new day →
 * counters zeroed and the old day's Mochi stats moved to `prev` (if it had
 * any; otherwise an older `prev` is kept as-is — still the latest Mochi day). */
export function rollAgentUsage(usage: AgentUsageData | null, today: string): AgentUsageData {
  if (usage && usage.date === today) return usage
  const fresh: AgentUsageData = {
    date: today,
    calls: 0,
    chatTurns: 0,
    chatConversations: 0,
    ceilingHit: false,
  }
  if (!usage) return fresh
  if (hasChatActivity(usage)) {
    fresh.prev = {
      date: usage.date,
      chatTurns: usage.chatTurns,
      chatConversations: usage.chatConversations,
      ceilingHit: usage.ceilingHit,
    }
  } else if (usage.prev) {
    fresh.prev = usage.prev
  }
  return fresh
}

/** Mark today's usage as having hit the fair-use ceiling. */
export function markCeilingHit(usage: AgentUsageData | null, today: string): AgentUsageData {
  return { ...rollAgentUsage(usage, today), ceilingHit: true }
}

export interface FlatCallDecision {
  allow: boolean
  next: AgentUsageData
}

/** aiInfer's one-shot reservation: one flat-cap slot per call (unchanged
 * semantics); Mochi stats on the doc are preserved. */
export function decideFlatCall(
  usage: AgentUsageData | null,
  today: string,
  limit: number,
): FlatCallDecision {
  const cur = rollAgentUsage(usage, today)
  if (cur.calls >= limit) return { allow: false, next: cur }
  return { allow: true, next: { ...cur, calls: cur.calls + 1 } }
}

export type ChatTurnReason = 'ok' | 'turns' | 'daily' | 'monthly'

export interface ChatTurnDecision {
  allow: boolean
  reason: ChatTurnReason
  /** agentUsage to persist — ALWAYS written (on reject it carries
   * ceilingHit=true so the roll-up can count ceiling hits). */
  nextAgentUsage: AgentUsageData
  /** Tier usage to persist (tier path, allowed conversation start only). */
  nextMochiUsage: MochiUsageDoc | null
}

/**
 * Flat path (MOCHI_TIER_ENFORCEMENT off, and comp users): a conversation
 * start takes one slot of the shared flat daily cap (`flatLimit`, shared with
 * aiInfer); every turn counts toward the turn backstop.
 */
export function decideChatTurnFlat(
  usage: AgentUsageData | null,
  today: string,
  startsConversation: boolean,
  flatLimit: number,
): ChatTurnDecision {
  const cur = rollAgentUsage(usage, today)
  const reject = (reason: ChatTurnReason): ChatTurnDecision => ({
    allow: false,
    reason,
    nextAgentUsage: { ...cur, ceilingHit: true },
    nextMochiUsage: null,
  })
  if (cur.chatTurns >= MAX_CHAT_TURNS_PER_DAY) return reject('turns')
  if (startsConversation && cur.calls >= flatLimit) return reject('daily')
  return {
    allow: true,
    reason: 'ok',
    nextAgentUsage: {
      ...cur,
      calls: cur.calls + (startsConversation ? 1 : 0),
      chatTurns: cur.chatTurns + 1,
      chatConversations: cur.chatConversations + (startsConversation ? 1 : 0),
    },
    nextMochiUsage: null,
  }
}

/**
 * Tier path (MOCHI_TIER_ENFORCEMENT on, non-comp): a conversation start
 * reserves against the tier's daily/monthly CONVERSATION ceiling
 * (TIER_LIMITS); follow-ups don't touch it. Every turn counts toward the
 * same turn backstop. The flat `calls` counter is not touched (aiInfer keeps
 * it to itself on this path, as before).
 */
export function decideChatTurnTier(
  tier: Tier,
  mochiUsage: MochiUsageDoc | null,
  agentUsage: AgentUsageData | null,
  today: string,
  month: string,
  startsConversation: boolean,
): ChatTurnDecision {
  const cur = rollAgentUsage(agentUsage, today)
  const reject = (reason: ChatTurnReason): ChatTurnDecision => ({
    allow: false,
    reason,
    nextAgentUsage: { ...cur, ceilingHit: true },
    nextMochiUsage: null,
  })
  if (cur.chatTurns >= MAX_CHAT_TURNS_PER_DAY) return reject('turns')
  let nextMochiUsage: MochiUsageDoc | null = null
  if (startsConversation) {
    const d = decideMochiReservation(tier, mochiUsage, today, month)
    if (!d.allow) return reject(d.reason === 'daily' ? 'daily' : 'monthly')
    nextMochiUsage = d.nextUsage
  }
  return {
    allow: true,
    reason: 'ok',
    nextAgentUsage: {
      ...cur,
      chatTurns: cur.chatTurns + 1,
      chatConversations: cur.chatConversations + (startsConversation ? 1 : 0),
    },
    nextMochiUsage,
  }
}

function nonNegInt(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0
}

function parseDayStats(raw: unknown): ChatDayStats | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  if (typeof r.date !== 'string') return undefined
  return {
    date: r.date,
    chatTurns: nonNegInt(r.chatTurns),
    chatConversations: nonNegInt(r.chatConversations),
    ceilingHit: r.ceilingHit === true,
  }
}

/**
 * Decode the `{value: '{"version","data"}'}` envelope at
 * users/{uid}/state/agentUsage. Null on any parse failure (callers treat it
 * as "first call today"). Docs written before the chat fields existed decode
 * with zeroed chat counters.
 */
export function parseAgentUsage(raw: unknown): AgentUsageData | null {
  if (!raw || typeof raw !== 'object') return null
  const val = (raw as { value?: unknown }).value
  if (typeof val !== 'string') return null
  let parsed: unknown
  try {
    parsed = JSON.parse(val)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const data = (parsed as { data?: unknown }).data
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  if (typeof d.date !== 'string' || typeof d.calls !== 'number' || !Number.isFinite(d.calls)) {
    return null
  }
  const out: AgentUsageData = {
    date: d.date,
    calls: nonNegInt(d.calls),
    chatTurns: nonNegInt(d.chatTurns),
    chatConversations: nonNegInt(d.chatConversations),
    ceilingHit: d.ceilingHit === true,
  }
  const prev = parseDayStats(d.prev)
  if (prev) out.prev = prev
  return out
}

/** The Mochi day stats an agentUsage doc still holds (current day + `prev`),
 * for the metrics roll-up. Days with no Mochi activity are omitted. */
export function chatDaysFromUsage(usage: AgentUsageData | null): ChatDayStats[] {
  if (!usage) return []
  const days: ChatDayStats[] = []
  if (hasChatActivity(usage)) {
    days.push({
      date: usage.date,
      chatTurns: usage.chatTurns,
      chatConversations: usage.chatConversations,
      ceilingHit: usage.ceilingHit,
    })
  }
  if (usage.prev && usage.prev.date !== usage.date) days.push(usage.prev)
  return days
}
