/**
 * Mochi's "resting" window — the client side of the shared daily fair-use
 * cap. Every AI surface (the chat, ambient field suggestions, suggest steps)
 * draws on ONE server cap per uid per UTC day, so once any of them hits
 * RESOURCE_EXHAUSTED they all stop calling until the next 00:00 UTC
 * (core mochiRestEndsAt) instead of spending further requests on a "no".
 *
 * Keyed by uid so an account switch on this device never inherits another
 * account's rest; SheetContext clears it on sign-out. Session-only (module
 * state) — a cold launch simply re-learns it from the server's next "no".
 */
import { mochiRestEndsAt } from '../../../../core/src/logic/mochiFallback'

/** 'all' = the shared cap (every AI surface pauses); 'chat' = only the
 * chat's own ceilings (server details.reason 'turns' or 'tier') — field
 * suggestions and suggest-steps keep working. */
export type MochiRestScope = 'all' | 'chat'

let rest: { uid: string; until: number; scope: MochiRestScope } | null = null

/** Epoch ms when `uid`'s rest ends, or 0 when not resting. A chat-only rest
 * counts only when asked for `'chat'` (the chat itself). */
export function mochiRestUntil(
  uid: string | null | undefined,
  nowMs: number = Date.now(),
  scope: MochiRestScope = 'all',
): number {
  if (!uid || !rest || rest.uid !== uid || nowMs >= rest.until) return 0
  if (rest.scope === 'chat' && scope !== 'chat') return 0
  return rest.until
}

/** Record that `uid` hit a cap; returns when the rest ends (epoch ms). A
 * chat-only rest never narrows an active shared one. */
export function markMochiResting(
  uid: string | null | undefined,
  now: Date = new Date(),
  scope: MochiRestScope = 'all',
): number {
  const until = mochiRestEndsAt(now).valueOf()
  if (!uid) return until
  const keepShared = scope === 'chat' && mochiRestUntil(uid, now.valueOf()) > 0
  if (!keepShared) rest = { uid, until, scope }
  return until
}

/** Forget any rest (sign-out). An account switch needs no reset: the rest is
 * keyed by uid, so mochiRestUntil() is 0 for any other account. */
export function clearMochiRest(): void {
  rest = null
}

/** Test-only: reset the module state between tests. */
export function __resetForTests(): void {
  rest = null
}

/** "8:00 PM", or "tomorrow at 1:00 AM" when the reset falls on a later local
 * day — the same label in the chat and the suggest-steps note. */
export function mochiRestLabel(untilMs: number, now: Date = new Date()): string {
  const d = new Date(untilMs)
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return d.toDateString() === now.toDateString() ? time : `tomorrow at ${time}`
}

/** The suggest-steps note while resting (English-only launch copy). */
export function suggestStepsRestingText(untilMs: number, now: Date = new Date()): string {
  return `Mochi's resting until ${mochiRestLabel(untilMs, now)} — you can add steps yourself.`
}
