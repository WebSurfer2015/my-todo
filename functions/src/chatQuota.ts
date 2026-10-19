/**
 * Pure accounting for Mochi (agentChat) fair use — no firebase-admin, so it is
 * unit-testable. quota.ts wraps these in Firestore transactions.
 *
 * The fair-use unit is a CONVERSATION (one capture), not a turn: only the
 * request that starts a conversation reserves a slot — a follow-up must prove
 * a live, server-minted conversation (signed convId, chatSignature.ts) that is
 * recorded here (`convs`, resolveConversation). Follow-up turns are free,
 * bounded by
 *  - MAX_TURNS_PER_CONVERSATION follow-ups per convId (counted on the record,
 *    so FORKING one live conversation into many requests can't be free
 *    forever — past the cap the next request is a new conversation), and
 *  - MAX_CHAT_TURNS_PER_DAY total turns per uid per UTC day — an anti-abuse
 *    backstop so a client can't run unlimited turns by never starting a new
 *    conversation (e.g. replaying a fake history).
 *
 * Usage lives in users/{uid}/state/agentUsage (server-only). Shape below; the
 * `chat*` / `ceilingHit` fields are per-UTC-day and reset with `date`
 * (`convs` is a rolling 24h list and is carried across days). On a
 * day rollover the previous day's Mochi stats move to `prev` so the daily
 * metrics roll-up (which runs the next morning) still sees them even if the
 * user has already used AI again today.
 */

import { decideMochiReservation, type MochiUsageDoc } from './mochiReservation'
import type { Tier } from './entitlements'
import type { ChatMessage } from './chatMessages'
import { isConvId } from './chatSignature'

/** Exactly what one ALLOWED reservation charged, so it can be refunded when
 * the upstream model call then fails (see refundAgentUsage /
 * refundMochiUsage, quota.ts refundUsage). `date`/`month` pin the refund to
 * the period that was charged — after a rollover the counter has already
 * reset and there is nothing to give back. */
export interface UsageCharge {
  /** UTC day the agentUsage counters were bumped on. */
  date: string
  calls: number
  chatTurns: number
  chatConversations: number
  /** Set when the tier counters (users/{uid}/state/mochiUsage) were bumped. */
  mochi: { date: string; month: string } | null
  /** The conversation id this reservation MINTED (a conversation start), so
   * a refund also forgets it — otherwise a retry of the failed start would
   * be recognised as a duplicate and ride free on a refunded slot. */
  convId?: string
  /** The conversation this reservation CONTINUED (a follow-up), so a refund
   * gives back its per-conversation turn (ConvRecord.n). */
  followUpConvId?: string
  /** The conversation a START RETRY reused (no slot taken), so a refund
   * gives back its reuse count (ConvRecord.r). */
  reusedConvId?: string
}

/** One server-minted conversation (chatSignature.ts contract). Kept tiny —
 * up to MAX_CONV_RECORDS of these live in one Firestore doc (~100 bytes
 * each as JSON, ~12 KB at the cap). */
export interface ConvRecord {
  /** convId (16-char base64url). */
  id: string
  /** Mint time, epoch ms (anchors the start-retry window). */
  t: number
  /** Last use, epoch ms: mint, follow-up or retry reuse. Expiry
   * (CONV_RECORD_TTL_MS) and eviction (MAX_CONV_RECORDS) go by this. */
  u: number
  /** historyHash() of the request that started it (retry de-dup). */
  h: string
  /** Follow-ups claimed so far (≤ MAX_TURNS_PER_CONVERSATION). */
  n: number
  /** Start retries currently riding on this convId (a retry's refund
   * decrements it) — while > 0, a refund of the minting request keeps the
   * record AND the slot (refundableCharge). */
  r: number
}

/** Recorded conversations kept per uid (least recently used evicted first).
 * ≥ MAX_CHAT_TURNS_PER_DAY, so even a day where every allowed turn starts a
 * conversation can't push out one that is still in use. */
export const MAX_CONV_RECORDS = 120
/** A recorded conversation stays continuable for this long after its LAST
 * USE (u). ROLLOVER RULE: the list is a ROLLING window — it is NOT reset at
 * UTC midnight, so a conversation started at 23:50 continues at 00:10 without
 * a new slot (and without being charged to the new day). */
export const CONV_RECORD_TTL_MS = 24 * 60 * 60_000
/** Free follow-ups per conversation. A real capture is a handful of turns;
 * past this the next request is treated as a NEW conversation (takes a slot,
 * fresh convId). Bounds forking: a tampered client re-using one live
 * conversation as the prefix of every new request gets at most this many
 * free turns per slot. */
export const MAX_TURNS_PER_CONVERSATION = 30
/** A conversation START whose normalized history matches the one that minted
 * a conversation this recently is a client RETRY (e.g. after a timeout whose
 * first attempt actually reserved) — it reuses that convId, no second slot. */
export const START_RETRY_WINDOW_MS = 2 * 60_000

/** Anti-abuse backstop on TOTAL agentChat turns per uid per UTC day —
 * far above a real person's use (15 conversations × a few follow-ups), and
 * the hard per-user chat cost bound. Worst-case turn on Haiku 4.5 ($1 in /
 * $5 out per M tokens): ≤20k-char context (MAX_CONTEXT_CHARS) + ≤16k-char
 * history (MAX_HISTORY_CHARS) ≈ 9k uncached input tokens, plus the cached
 * system+tools prefix (cache reads are 0.1×), plus ≤1024 output tokens ≈
 * $0.015 — so ≤ ~$1.50/uid/day worst case. A typical turn (small context,
 * short history, ~50 output tokens) is well under $0.005. */
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
  /** Recently used conversations, least recently used first (rolling, see
   * CONV_RECORD_TTL_MS) — NOT reset with `date`. */
  convs?: ConvRecord[]
}

/** True when the window has exactly one user turn — always a conversation
 * start. (The full rule — signed, fresh, recorded convId — is agentChatCore
 * claimFollowUp + resolveConversation.) */
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
  // Conversations are a rolling window, not per-day (CONV_RECORD_TTL_MS).
  if (usage.convs?.length) fresh.convs = usage.convs
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
  /** What was charged (allowed only) — for a refund on upstream failure. */
  charge: UsageCharge | null
}

/** aiInfer's one-shot reservation: one flat-cap slot per call (unchanged
 * semantics); Mochi stats on the doc are preserved. */
export function decideFlatCall(
  usage: AgentUsageData | null,
  today: string,
  limit: number,
): FlatCallDecision {
  const cur = rollAgentUsage(usage, today)
  if (cur.calls >= limit) return { allow: false, next: cur, charge: null }
  return {
    allow: true,
    next: { ...cur, calls: cur.calls + 1 },
    charge: { date: today, calls: 1, chatTurns: 0, chatConversations: 0, mochi: null },
  }
}

/**
 * Undo a charge on the agentUsage doc after the upstream model call failed or
 * timed out (the user got nothing, so it shouldn't count). Returns the doc to
 * write, or null when there's nothing to refund (no doc, or the day already
 * rolled over). Counters never go below 0; ceilingHit/prev are untouched.
 */
export function refundAgentUsage(
  usage: AgentUsageData | null,
  rawCharge: UsageCharge,
): AgentUsageData | null {
  if (!usage) return null
  const charge = refundableCharge(usage, rawCharge)
  const convs = refundConvs(usage.convs, charge)
  const convsChanged = convs !== usage.convs
  const sameDay = usage.date === charge.date
  const counters = charge.calls !== 0 || charge.chatTurns !== 0 || charge.chatConversations !== 0
  if (!convsChanged && (!sameDay || !counters)) return null
  const next: AgentUsageData = { ...usage }
  if (convsChanged) next.convs = convs
  if (sameDay) {
    next.calls = Math.max(0, usage.calls - charge.calls)
    next.chatTurns = Math.max(0, usage.chatTurns - charge.chatTurns)
    next.chatConversations = Math.max(0, usage.chatConversations - charge.chatConversations)
  }
  return next
}

/**
 * What a refund may actually give back. A failed MINT whose conversation a
 * start retry is riding on (record still there with r > 0) is NOT a lost
 * slot — the retry's conversation continues on it — so the slot (`calls`,
 * `chatConversations`, the tier counters) is kept and only the failed turn
 * (`chatTurns`) is returned. Otherwise the charge as recorded. Callers use
 * the result for BOTH halves of a refund (agentUsage and mochiUsage).
 *
 * Residual (conservative): if that retry then fails too, the slot stays
 * spent — the user loses one slot, nobody gets a free conversation.
 */
export function refundableCharge(usage: AgentUsageData | null, charge: UsageCharge): UsageCharge {
  if (!charge.convId) return charge
  const rec = usage?.convs?.find((c) => c.id === charge.convId)
  if (!rec || rec.r === 0) return charge
  return { ...charge, calls: 0, chatConversations: 0, mochi: null }
}

/** The conversation-record half of a refund (even across a day rollover —
 * the list is rolling). Returns `convs` itself when nothing changes.
 *  - A MINTED convId is forgotten (no reply was signed for it; keeping it
 *    would let a retry of the failed start reuse it for free) — unless a
 *    start retry is riding on it (r > 0): that request may hold a signed
 *    reply, so the record stays as-is (the retry's own refund drops r).
 *  - A START RETRY gives back its reuse (r − 1, never < 0).
 *  - A FOLLOW-UP gives back its per-conversation turn (n − 1, never < 0). */
function refundConvs(
  convs: ConvRecord[] | undefined,
  charge: UsageCharge,
): ConvRecord[] | undefined {
  const id = charge.convId ?? charge.reusedConvId ?? charge.followUpConvId
  const rec = id ? convs?.find((c) => c.id === id) : undefined
  if (!convs || !rec) return convs
  if (charge.convId) return rec.r === 0 ? convs.filter((c) => c !== rec) : convs
  const field = charge.reusedConvId ? 'r' : 'n'
  if (rec[field] === 0) return convs
  return convs.map((c) => (c === rec ? { ...c, [field]: c[field] - 1 } : c))
}

/** A record is live until CONV_RECORD_TTL_MS after its last use. */
function isLiveConv(c: ConvRecord, nowMs: number): boolean {
  return nowMs - c.u < CONV_RECORD_TTL_MS
}

/**
 * The daily clean-up's half of the 24h rule (metricsRollupJob
 * pruneUsageSnapshot): reservations only drop expired records lazily,
 * on the user's NEXT Mochi request, so a user who never chats again would
 * keep them (with their history hashes) indefinitely. Returns the doc with
 * every expired record removed (`convs` omitted when none are left), or null
 * when nothing has expired (no write). Counters and `prev` are untouched.
 */
export function pruneExpiredConvs(usage: AgentUsageData | null, nowMs: number): AgentUsageData | null {
  if (!usage?.convs?.length) return null
  const live = usage.convs.filter((c) => isLiveConv(c, nowMs))
  if (live.length === usage.convs.length) return null
  const { convs: _expired, ...rest } = usage
  return live.length ? { ...rest, convs: live } : rest
}

export interface ConversationResolution {
  /** True → this request takes a fair-use slot. */
  startsConversation: boolean
  /** The convId every reply to this request is signed with. */
  convId: string
  /** True when `convId` was minted by this request (and is in nextConvs). */
  minted: boolean
  /** True when this request is a free follow-up of a recorded conversation
   * (its record's `n` was bumped in nextConvs). */
  followUp: boolean
  /** The conversation list to persist if the reservation is ALLOWED. */
  nextConvs: ConvRecord[]
}

/**
 * Server half of "is this a new conversation?" — runs inside the reservation
 * transaction against the user's recorded conversations:
 *  1. `claimedConvId` (already sig-verified + fresh, agentChatCore
 *     claimFollowUp) is in the live list AND has had fewer than
 *     MAX_TURNS_PER_CONVERSATION follow-ups → follow-up, no slot (n + 1).
 *  2. Otherwise it is a START — unless the same normalized history started a
 *     conversation < START_RETRY_WINDOW_MS ago (a client retry): reuse that
 *     convId, no slot (r + 1). The retry window runs from the ORIGINAL mint,
 *     so it can't be extended by retrying again.
 *  3. Otherwise mint a new convId (slot reserved by the caller).
 * Every use stamps `u` and moves the record to the end (most recently used).
 * Records idle ≥ CONV_RECORD_TTL_MS are dropped; the list is capped at
 * MAX_CONV_RECORDS, least recently used evicted first.
 */
export function resolveConversation(
  convs: ConvRecord[] | undefined,
  claimedConvId: string | null,
  startHash: string,
  nowMs: number,
  mint: () => string,
): ConversationResolution {
  const live = (convs ?? []).filter((c) => isLiveConv(c, nowMs))
  /** `rec` updated, stamped and moved to the end (most recently used). */
  const touch = (rec: ConvRecord, upd: Partial<ConvRecord>): ConvRecord[] => [
    ...live.filter((c) => c !== rec),
    { ...rec, ...upd, u: nowMs },
  ]
  const claimed = claimedConvId ? live.find((c) => c.id === claimedConvId) : undefined
  if (claimed && claimed.n < MAX_TURNS_PER_CONVERSATION) {
    return {
      startsConversation: false,
      convId: claimed.id,
      minted: false,
      followUp: true,
      nextConvs: touch(claimed, { n: claimed.n + 1 }),
    }
  }
  const retry = live.find((c) => c.h === startHash && nowMs - c.t < START_RETRY_WINDOW_MS)
  if (retry) {
    return {
      startsConversation: false,
      convId: retry.id,
      minted: false,
      followUp: false,
      nextConvs: touch(retry, { r: retry.r + 1 }),
    }
  }
  const id = mint()
  return {
    startsConversation: true,
    convId: id,
    minted: true,
    followUp: false,
    nextConvs: [...live, { id, t: nowMs, u: nowMs, h: startHash, n: 0, r: 0 }].slice(
      -MAX_CONV_RECORDS,
    ),
  }
}

/** Undo a tier (mochiUsage) charge: the day counter only if still the same
 * day, the month counter only if still the same month. Null = nothing to do. */
export function refundMochiUsage(
  usage: MochiUsageDoc | null,
  charge: UsageCharge,
): MochiUsageDoc | null {
  if (!usage || !charge.mochi) return null
  const sameDay = usage.date === charge.mochi.date
  const sameMonth = usage.month === charge.mochi.month
  if (!sameDay && !sameMonth) return null
  return {
    ...usage,
    dayCalls: sameDay ? Math.max(0, usage.dayCalls - 1) : usage.dayCalls,
    monthCalls: sameMonth ? Math.max(0, usage.monthCalls - 1) : usage.monthCalls,
  }
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
  /** What an allowed turn charged (null on reject) — refunded if the model
   * call then fails. */
  charge: UsageCharge | null
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
    charge: null,
  })
  if (cur.chatTurns >= MAX_CHAT_TURNS_PER_DAY) return reject('turns')
  if (startsConversation && cur.calls >= flatLimit) return reject('daily')
  const start = startsConversation ? 1 : 0
  return {
    allow: true,
    reason: 'ok',
    nextAgentUsage: {
      ...cur,
      calls: cur.calls + start,
      chatTurns: cur.chatTurns + 1,
      chatConversations: cur.chatConversations + start,
    },
    nextMochiUsage: null,
    charge: { date: today, calls: start, chatTurns: 1, chatConversations: start, mochi: null },
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
    charge: null,
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
    charge: {
      date: today,
      calls: 0,
      chatTurns: 1,
      chatConversations: startsConversation ? 1 : 0,
      mochi: nextMochiUsage ? { date: today, month } : null,
    },
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
  const convs = parseConvs(d.convs)
  if (convs.length) out.convs = convs
  return out
}

const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** A stored follow-up count: a non-negative integer, else the
 * per-conversation cap — junk fails CLOSED (a capped record), never reads as
 * a fresh conversation. */
const parseCount = (v: unknown): number =>
  isFiniteNum(v) && v >= 0 ? Math.floor(v) : MAX_TURNS_PER_CONVERSATION

/** Validated conversation records (storage is untrusted): well-formed ids,
 * finite times, string hashes, sane counts; capped at MAX_CONV_RECORDS
 * (the list is stored in use order, so the most recently used are kept). */
function parseConvs(raw: unknown): ConvRecord[] {
  if (!Array.isArray(raw)) return []
  const out: ConvRecord[] = []
  for (const rec of raw) {
    if (!rec || typeof rec !== 'object') continue
    const { id, t, u, h, n, r } = rec as Record<string, unknown>
    if (!isConvId(id) || !isFiniteNum(t) || !isFiniteNum(u) || typeof h !== 'string') continue
    // A junk reuse count reads as 0: a refund of the start then forgets the
    // record (the conservative side for r).
    const reuses = isFiniteNum(r) && r >= 0 ? Math.floor(r) : 0
    out.push({ id, t, u, h: h.slice(0, 64), n: parseCount(n), r: reuses })
  }
  return out.slice(-MAX_CONV_RECORDS)
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
