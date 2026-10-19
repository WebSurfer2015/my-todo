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
}

interface NotifyApi {
  showSnackbar: (opts: SnackbarOptions) => void
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

// Long enough to notice and reach Undo (was 3.5s — too quick, especially
// with VoiceOver or a slower reader).
const DEFAULT_DURATION = 6000

export function NotifyProvider({ children }: { children: ReactNode }) {
  const [snackbar, setSnackbar] = useState<SnackbarState | null>(null)
  const snackbarRef = useRef<SnackbarState | null>(null)
  const idRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const dismissSnackbar = useCallback(() => {
    snackbarRef.current = null
    setSnackbar(null)
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const showSnackbar = useCallback((opts: SnackbarOptions) => {
    const id = ++idRef.current
    const prev = snackbarRef.current
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
      }
    }
    snackbarRef.current = next
    setSnackbar(next)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      if (snackbarRef.current?.id === id) {
        snackbarRef.current = null
        setSnackbar(null)
      }
      timerRef.current = null
    }, next.durationMs)
  }, [])

  const handleAction = useCallback(() => {
    if (snackbar?.onAction) snackbar.onAction()
    dismissSnackbar()
  }, [snackbar, dismissSnackbar])

  const value = useMemo<NotifyApi>(() => ({ showSnackbar }), [showSnackbar])

  return (
    <NotifyContext.Provider value={value}>
      {children}
      {snackbar && (
        <Snackbar
          message={snackbar.message}
          actionLabel={snackbar.actionLabel}
          onAction={handleAction}
          onDismiss={dismissSnackbar}
        />
      )}
    </NotifyContext.Provider>
  )
}

export function useNotify(): NotifyApi {
  return useContext(NotifyContext)
}

function Snackbar({
  message, actionLabel, onAction, onDismiss,
}: {
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
    <View style={styles.container} pointerEvents="box-none">
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
      bottom: Platform.OS === 'ios' ? 40 : 24,
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
