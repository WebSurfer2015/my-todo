import crashlytics from '@react-native-firebase/crashlytics'

/**
 * Forward UNCAUGHT JS errors to Crashlytics (side-effect module — import
 * once at app startup). RN's ErrorUtils global catches both fatal and
 * non-fatal uncaught exceptions, but its default handler only red-boxes in
 * dev / shows a generic crash in prod WITHOUT recording. We chain: record
 * to Crashlytics, then defer to the previous handler so the normal crash
 * UX still runs. Wrapped in try/catch so the reporter can't crash the
 * crash handler.
 *
 * (Review gap: production JS errors outside the React ErrorBoundary were
 * invisible. Unhandled promise rejections in Hermes route through its own
 * rejection tracker — dev-only by default — but uncaught throws, the
 * common prod failure, come through ErrorUtils.)
 */
type GlobalErrorHandler = (error: unknown, isFatal?: boolean) => void
type ErrUtils = {
  getGlobalHandler?: () => GlobalErrorHandler
  setGlobalHandler?: (handler: GlobalErrorHandler) => void
}

const EU = (globalThis as unknown as { ErrorUtils?: ErrUtils }).ErrorUtils
const previous = EU?.getGlobalHandler?.()

EU?.setGlobalHandler?.((error, isFatal) => {
  try {
    const e = error instanceof Error ? error : new Error(String(error))
    crashlytics().log(`Uncaught JS error (fatal=${!!isFatal})`)
    crashlytics().recordError(e)
  } catch {
    // never let the crash reporter crash the crash handler
  }
  previous?.(error, isFatal)
})
