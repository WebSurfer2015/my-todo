/**
 * App-wide count of presented RN <Modal>s (and Alerts) that SheetProvider
 * doesn't own (pickers, the paywall, per-screen sheets on the shared
 * SheetShell…).
 *
 * iOS can't present a Modal over another one, so before useDetailsRouter
 * opens the to-do details sheet from a reminder tap it asks
 * `isAnyModalPresented()` — and if something is up, it parks the request
 * (offered later as a snackbar) instead of force-closing the user's sheet
 * (which would discard a draft).
 *
 * Instrumented in the shared shells (SheetShell, PickerModal) plus the few
 * hand-rolled Modals; row-level confirms go through `alertWithPresence`. A
 * plain module counter, not React state: it's read at tap time, so nothing
 * needs to re-render when it changes.
 */
import { useEffect } from 'react'
import { Alert, type AlertButton } from 'react-native'
import { MODAL_DISMISS_GRACE_MS } from './modalTiming'

let presented = 0

export function isAnyModalPresented(): boolean {
  return presented > 0
}

/** Count one presentation; the returned release (idempotent) uncounts it
 * after the dismiss grace. */
function present(): () => void {
  presented += 1
  let released = false
  return () => {
    if (released) return
    released = true
    setTimeout(() => {
      presented = Math.max(0, presented - 1)
    }, MODAL_DISMISS_GRACE_MS)
  }
}

/** Count this Modal as presented while `visible`. Call unconditionally (before
 * any early `return null`). */
export function useModalPresence(visible: boolean): void {
  useEffect(() => {
    if (!visible) return
    return present()
  }, [visible])
}

/** `Alert.alert` that counts as presented until a button is pressed or it's
 * dismissed — a reminder tap meanwhile parks instead of presenting over it. */
export function alertWithPresence(
  title: string,
  message?: string,
  buttons?: AlertButton[],
  options?: Parameters<typeof Alert.alert>[3],
): void {
  const release = present()
  const list: AlertButton[] = buttons && buttons.length > 0 ? buttons : [{ text: 'OK' }]
  const wrapped = list.map((b) => ({
    ...b,
    onPress: () => {
      release()
      b.onPress?.()
    },
  }))
  Alert.alert(title, message, wrapped, {
    ...options,
    onDismiss: () => {
      release()
      options?.onDismiss?.()
    },
  })
}

/** Test-only: forget every counted Modal (a test's pending grace timers
 * would otherwise leak into the next one). */
export function __resetModalPresenceForTests(): void {
  presented = 0
}
