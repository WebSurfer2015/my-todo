import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react'
import { AccessibilityInfo, Animated, StyleSheet, Text, TouchableOpacity, View, Platform } from 'react-native'
import { useTheme, ThemeColors } from './theme'

interface SnackbarOptions {
  message: string
  actionLabel?: string
  onAction?: () => void
  durationMs?: number
  /**
   * If set, repeat calls with the same mergeKey while a toast is still
   * showing accumulate into a single stacked toast ("3 moved to trash. Undo all").
   * Each merged onAction is preserved and called newest-first on Undo.
   */
  mergeKey?: string
  /** Builder for the merged message; receives the new total count (>=2). */
  mergedMessage?: (count: number) => string
  /** Label shown when stacked; defaults to actionLabel. */
  mergedActionLabel?: string
  /**
   * Low priority: never replace a snackbar that's showing (an Undo) — wait
   * for it to end, then show (the duration starts once visible). One waiting
   * slot: a newer waiting snackbar replaces an older one, and it replaces a
   * VISIBLE waiting-kind one directly. Used by the reminder "Open" offer.
   */
  queue?: boolean
  /**
   * For a `queue` snackbar: whether it can be SEEN right now. Checked when it
   * would show — immediately, or once the Undo it waited for ends. If false
   * (e.g. a sheet opened meanwhile and would cover it), it isn't shown;
   * `onBlocked` hands it back to its owner to wait again.
   */
  canShow?: () => boolean
  onBlocked?: () => void
  /** Survive an account change (sign-out / account deletion) — e.g. the
   * "Your data has been cleared." confirmation shown right after sign-out. */
  outlivesAccount?: boolean
}

interface SnackbarState {
  id: number
  message: string
  actionLabel?: string
  onAction?: () => void
  durationMs: number
  mergeKey?: string
  mergedCount: number
  mergedActions: Array<() => void>
  /** This toast's OWN action (onAction above may be a merged composite). */
  ownAction?: () => void
  mergedMessage?: (count: number) => string
  mergedActionLabel?: string
  /** The options it was shown with (re-queued if an Undo replaces it). */
  source: SnackbarOptions
  /** Every toast merged into this one, oldest first (for retractSnackbar). */
  parts: SnackbarPart[]
}

interface SnackbarPart {
  message: string
  actionLabel?: string
  action?: () => void
}

interface NotifyApi {
  showSnackbar: (opts: SnackbarOptions) => void
  /** Hide the snackbar (and drop a waiting one). `accountChange`: the
   * signed-in account changed — keep only `outlivesAccount` snackbars. */
  dismissSnackbar: (opts?: { accountChange?: boolean }) => void
  /** The action `onAction` was already taken elsewhere (an inline Undo):
   * drop that toast — or just its part of a merged one — so its Undo can't
   * run twice. No-op if it isn't showing. */
  retractSnackbar: (onAction: () => void) => void
}

/**
 * Where a new snackbar goes, given what's showing / waiting (pure):
 * - `wait`: a low-priority (`queue`) snackbar while a normal one is up —
 *   park it in the single waiting slot.
 * - `show`: show it now. `requeue` = the visible low-priority snackbar it
 *   replaces, to show again once this one ends (unless one already waits).
 */
export function planSnackbar(
  visible: Pick<SnackbarOptions, 'queue'> | null,
  waiting: SnackbarOptions | null,
  next: SnackbarOptions,
): { action: 'wait' } | { action: 'show'; requeue: boolean } {
  if (next.queue && visible && !visible.queue) return { action: 'wait' }
  return { action: 'show', requeue: !next.queue && !!visible?.queue && !waiting }
}

const NotifyContext = createContext<NotifyApi>(null!)

/**
 * Composite "Undo all" for a merged toast: runs the latest action first, then
 * the accumulated ones newest → oldest. Undos must unwind in reverse — a later
 * action may depend on an earlier one (e.g. complete, then trash the same
 * to-do), so undoing the oldest first restores a stale snapshot underneath.
 */
export function runNewestFirst(
  accumulated: ReadonlyArray<() => void>,
  latest?: () => void,
): () => void {
  return () => {
    latest?.()
    for (let i = accumulated.length - 1; i >= 0; i--) accumulated[i]()
  }
}

/** Gap between the snackbar and the top of the tab bar. */
export const SNACKBAR_TAB_BAR_GAP = 8
/** Snackbar bottom offset where there's no tab bar (signed-out, loading). */
const SNACKBAR_DEFAULT_BOTTOM = Platform.OS === 'ios' ? 40 : 24

/** Where the root snackbar sits: above the tab bar while one is showing
 * (its full height, safe area included, + the gap), else the default. */
export function snackbarBottom(tabBarHeight: number | null): number {
  return tabBarHeight && tabBarHeight > 0 ? tabBarHeight + SNACKBAR_TAB_BAR_GAP : SNACKBAR_DEFAULT_BOTTOM
}

// The tab bar reports its height here while mounted (see useReportTabBarHeight).
const TabBarHeightContext = createContext<(key: object, height: number | null) => void>(() => {})

/** Called from inside the tab navigator: keeps the snackbar above the tab
 * bar for as long as the caller is mounted. */
export function useReportTabBarHeight(height: number): void {
  const report = useContext(TabBarHeightContext)
  const keyRef = useRef<object>({})
  useEffect(() => {
    const key = keyRef.current
    report(key, height)
    return () => report(key, null)
  }, [report, height])
}

// Long enough to notice and reach Undo (was 3.5s — too quick, especially
// with VoiceOver or a slower reader).
export const SNACKBAR_DURATION_MS = 6000
const DEFAULT_DURATION = SNACKBAR_DURATION_MS

export function NotifyProvider({ children }: { children: ReactNode }) {
  const [snackbar, setSnackbar] = useState<SnackbarState | null>(null)
  const snackbarRef = useRef<SnackbarState | null>(null)
  const idRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // A low-priority snackbar waiting for the visible one to end.
  const waitingRef = useRef<SnackbarOptions | null>(null)
  const showRef = useRef<(opts: SnackbarOptions) => void>(() => {})
  // Tab-bar height per reporter (every mounted tab screen reports the same
  // bar); the snackbar uses the tallest while any is mounted.
  const tabBarHeightsRef = useRef(new Map<object, number>())
  const [tabBarHeight, setTabBarHeight] = useState<number | null>(null)
  const reportTabBarHeight = useCallback((key: object, height: number | null) => {
    const map = tabBarHeightsRef.current
    if (height === null) map.delete(key)
    else map.set(key, height)
    setTabBarHeight(map.size ? Math.max(...map.values()) : null)
  }, [])

  // The visible snackbar ended (timeout, action, ×): show the waiting one.
  const endCurrent = useCallback(() => {
    snackbarRef.current = null
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    const waiting = waitingRef.current
    waitingRef.current = null
    if (waiting) showRef.current(waiting)
    else setSnackbar(null)
  }, [])

  // A queued snackbar about to show where it can't be seen: hand it back.
  const blocked = (opts: SnackbarOptions): boolean => {
    if (!opts.queue || !opts.canShow || opts.canShow()) return false
    opts.onBlocked?.()
    return true
  }

  const dismissSnackbar = useCallback((opts?: { accountChange?: boolean }) => {
    if (opts?.accountChange) {
      if (waitingRef.current && !waitingRef.current.outlivesAccount) waitingRef.current = null
      if (snackbarRef.current?.source.outlivesAccount) return
    }
    endCurrent()
  }, [endCurrent])

  const showSnackbar = useCallback((opts: SnackbarOptions) => {
    const prev = snackbarRef.current
    const plan = planSnackbar(prev?.source ?? null, waitingRef.current, opts)
    if (plan.action === 'wait') {
      waitingRef.current = opts
      return
    }
    if (blocked(opts)) {
      // Nothing new shows; a slot freed by endCurrent stays empty.
      if (!prev) setSnackbar(null)
      return
    }
    if (plan.requeue && prev) waitingRef.current = prev.source
    const id = ++idRef.current
    let next: SnackbarState
    if (prev && opts.mergeKey && prev.mergeKey === opts.mergeKey) {
      const newCount = prev.mergedCount + 1
      const accumulated = [...prev.mergedActions]
      // Push the previous toast's own action, not its composite — pushing the
      // composite re-ran every earlier undo once per later merge.
      if (prev.ownAction) accumulated.push(prev.ownAction)
      const builder = opts.mergedMessage ?? prev.mergedMessage
      const message = builder ? builder(newCount) : opts.message
      next = {
        id,
        message,
        actionLabel:
          opts.mergedActionLabel ??
          prev.mergedActionLabel ??
          opts.actionLabel ??
          prev.actionLabel,
        onAction: runNewestFirst(accumulated, opts.onAction),
        durationMs: opts.durationMs ?? DEFAULT_DURATION,
        mergeKey: opts.mergeKey,
        mergedCount: newCount,
        mergedActions: accumulated,
        ownAction: opts.onAction,
        mergedMessage: builder,
        mergedActionLabel: opts.mergedActionLabel ?? prev.mergedActionLabel,
        source: opts,
        parts: [...prev.parts, { message: opts.message, actionLabel: opts.actionLabel, action: opts.onAction }],
      }
    } else {
      next = {
        id,
        message: opts.message,
        actionLabel: opts.actionLabel,
        onAction: opts.onAction,
        durationMs: opts.durationMs ?? DEFAULT_DURATION,
        mergeKey: opts.mergeKey,
        mergedCount: 1,
        mergedActions: [],
        ownAction: opts.onAction,
        mergedMessage: opts.mergedMessage,
        mergedActionLabel: opts.mergedActionLabel,
        source: opts,
        parts: [{ message: opts.message, actionLabel: opts.actionLabel, action: opts.onAction }],
      }
    }
    snackbarRef.current = next
    setSnackbar(next)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      if (snackbarRef.current?.id === id) endCurrent()
    }, next.durationMs)
  }, [endCurrent])
  useEffect(() => {
    showRef.current = showSnackbar
  }, [showSnackbar])

  const retractSnackbar = useCallback(
    (action: () => void) => {
      const cur = snackbarRef.current
      if (!cur || !cur.parts.some((p) => p.action === action)) return
      const parts = cur.parts.filter((p) => p.action !== action)
      if (parts.length === 0) {
        endCurrent()
        return
      }
      const last = parts[parts.length - 1]
      const count = parts.length
      const next: SnackbarState = {
        ...cur,
        message: count >= 2 && cur.mergedMessage ? cur.mergedMessage(count) : last.message,
        actionLabel: count >= 2 ? (cur.mergedActionLabel ?? last.actionLabel) : last.actionLabel,
        onAction: runNewestFirst(
          parts.slice(0, -1).flatMap((p) => (p.action ? [p.action] : [])),
          last.action,
        ),
        mergedCount: count,
        mergedActions: parts.slice(0, -1).flatMap((p) => (p.action ? [p.action] : [])),
        ownAction: last.action,
        parts,
      }
      snackbarRef.current = next
      setSnackbar(next)
    },
    [endCurrent],
  )

  // End the pressed snackbar BEFORE running its action: the action may show
  // a follow-up snackbar (e.g. a partial-Undo notice), which ending afterwards
  // would wipe out.
  const handleAction = useCallback(() => {
    const action = snackbar?.onAction
    endCurrent()
    action?.()
  }, [snackbar, endCurrent])

  const value = useMemo<NotifyApi>(
    () => ({ showSnackbar, dismissSnackbar, retractSnackbar }),
    [showSnackbar, dismissSnackbar, retractSnackbar],
  )

  return (
    <NotifyContext.Provider value={value}>
      <TabBarHeightContext.Provider value={reportTabBarHeight}>
        {children}
      </TabBarHeightContext.Provider>
      {snackbar && (
        <Snackbar
          bottom={snackbarBottom(tabBarHeight)}
          message={snackbar.message}
          actionLabel={snackbar.actionLabel}
          onAction={handleAction}
          onDismiss={endCurrent}
        />
      )}
    </NotifyContext.Provider>
  )
}

export function useNotify(): NotifyApi {
  return useContext(NotifyContext)
}

function Snackbar({
  bottom, message, actionLabel, onAction, onDismiss,
}: {
  bottom: number
  message: string
  actionLabel?: string
  onAction: () => void
  onDismiss: () => void
}) {
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  const translateY = useRef(new Animated.Value(80)).current
  const opacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateY, { toValue: 0, duration: 220, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start()
  }, [translateY, opacity])
  // accessibilityRole="alert" isn't announced on iOS — speak it explicitly
  // so VoiceOver users know an Undo is available.
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(actionLabel ? `${message}. ${actionLabel} available.` : message)
  }, [message, actionLabel])

  return (
    <View style={[styles.container, { bottom }]} pointerEvents="box-none">
      <Animated.View
        style={[styles.snackbar, { transform: [{ translateY }], opacity }]}
        accessibilityRole="alert"
      >
        <Text style={styles.message} numberOfLines={2}>{message}</Text>
        {actionLabel && (
          <TouchableOpacity onPress={onAction} hitSlop={8} accessibilityRole="button">
            <Text style={styles.action}>{actionLabel}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={onDismiss}
          hitSlop={8}
          style={styles.closeBtn}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
        >
          <Text style={styles.close}>×</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  )
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: {
      position: 'absolute',
      left: 0,
      right: 0,
      alignItems: 'center',
      paddingHorizontal: 16,
    },
    snackbar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: c.modal,
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 16,
      maxWidth: 480,
      width: '100%',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.18,
      shadowRadius: 12,
      elevation: 8,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
    },
    message: {
      flex: 1,
      color: c.label,
      fontSize: 14,
      letterSpacing: -0.16,
    },
    action: {
      color: c.blue,
      fontWeight: '600',
      fontSize: 14,
      paddingHorizontal: 4,
    },
    closeBtn: {
      width: 24,
      height: 24,
      alignItems: 'center',
      justifyContent: 'center',
    },
    close: {
      color: c.gray3,
      fontSize: 22,
      lineHeight: 22,
      fontWeight: '300',
    },
  })
}
