/**
 * App-wide count of presented RN <Modal>s that SheetProvider doesn't own
 * (pickers, the paywall, per-screen sheets on the shared SheetShell…).
 *
 * iOS can't present a Modal over another one, so before SheetProvider opens
 * the to-do details sheet from a reminder tap it asks `isAnyModalPresented()`
 * — and if something is up, it offers a snackbar instead of force-closing
 * the user's sheet (which would discard a draft).
 *
 * Instrumented in the shared shells (SheetShell, PickerModal) plus the few
 * hand-rolled Modals. A plain module counter, not React state: it's read at
 * tap time, so nothing needs to re-render when it changes.
 */
import { useEffect } from 'react'
import { MODAL_DISMISS_GRACE_MS } from './modalTiming'

let presented = 0

export function isAnyModalPresented(): boolean {
  return presented > 0
}

/** Count this Modal as presented while `visible`. Call unconditionally (before
 * any early `return null`). */
export function useModalPresence(visible: boolean): void {
  useEffect(() => {
    if (!visible) return
    presented += 1
    return () => {
      setTimeout(() => {
        presented = Math.max(0, presented - 1)
      }, MODAL_DISMISS_GRACE_MS)
    }
  }, [visible])
}

/** Test-only: forget every counted Modal (a test's pending grace timers
 * would otherwise leak into the next one). */
export function __resetModalPresenceForTests(): void {
  presented = 0
}
