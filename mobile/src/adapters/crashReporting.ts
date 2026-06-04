import crashlytics from '@react-native-firebase/crashlytics'

/**
 * Forward unhandled promise rejections and uncaught JS errors to
 * Crashlytics so production silent failures stop being invisible.
 *
 * React Native's promise-rejection tracker is dev-only by default; we
 * call enable() with our own onUnhandled to forward in prod too. The
 * `promise` polyfill is loaded by RN at startup, so the require() is
 * safe across Hermes and JSC.
 *
 * Each forwarder is wrapped in try/catch — a crash inside the crash
 * reporter must not take down the app.
 */
export function installCrashReporters(): void {
  // ── Promise rejections ─────────────────────────────────────────────
  try {
    const tracking = require('promise/setimmediate/rejection-tracking')
    if (tracking?.enable) {
      tracking.enable({
        allRejections: true,
        onUnhandled: (id: number, error: unknown) => {
          try {
            crashlytics().log(`unhandled promise rejection #${id}`)
            const err =
              error instanceof Error
                ? error
                : new Error(
                    typeof error === 'string' ? error : safeStringify(error),
                  )
            crashlytics().recordError(err)
          } catch {
            // last-resort silent — never propagate from the reporter.
          }
        },
        onHandled: () => {
          // No-op. We don't care about late-handled ones for telemetry.
        },
      })
    }
  } catch {
    // promise polyfill not present or shape changed — skip.
  }

  // ── Synchronous JS errors that escape React's tree ─────────────────
  try {
    const ErrorUtils = (global as unknown as { ErrorUtils?: ErrorUtilsShape })
      .ErrorUtils
    if (ErrorUtils?.setGlobalHandler) {
      const prev = ErrorUtils.getGlobalHandler?.()
      ErrorUtils.setGlobalHandler((error: unknown, isFatal?: boolean) => {
        try {
          crashlytics().log(
            `global JS error${isFatal ? ' (fatal)' : ''}`,
          )
          const err =
            error instanceof Error
              ? error
              : new Error(
                  typeof error === 'string' ? error : safeStringify(error),
                )
          crashlytics().recordError(err)
        } catch {
          // ignore
        }
        // Preserve RN's default red-box behavior in dev by chaining to
        // the previous handler. In release, the previous handler is the
        // platform default which just logs.
        try {
          prev?.(error, isFatal)
        } catch {
          // ignore
        }
      })
    }
  } catch {
    // ErrorUtils not available — skip.
  }
}

interface ErrorUtilsShape {
  getGlobalHandler?: () => (error: unknown, isFatal?: boolean) => void
  setGlobalHandler: (
    handler: (error: unknown, isFatal?: boolean) => void,
  ) => void
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v) ?? String(v)
  } catch {
    return String(v)
  }
}
