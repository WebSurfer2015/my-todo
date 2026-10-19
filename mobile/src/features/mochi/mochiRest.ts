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

let rest: { uid: string; until: number } | null = null

/** Epoch ms when `uid`'s rest ends, or 0 when not resting. */
export function mochiRestUntil(uid: string | null | undefined, nowMs: number = Date.now()): number {
  if (!uid || !rest || rest.uid !== uid || nowMs >= rest.until) return 0
  return rest.until
}

/** Record that `uid` hit the cap; returns when the rest ends (epoch ms). */
export function markMochiResting(uid: string | null | undefined, now: Date = new Date()): number {
  const until = mochiRestEndsAt(now).valueOf()
  if (uid) rest = { uid, until }
  return until
}

/** Forget any rest (sign-out). */
export function clearMochiRest(): void {
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
