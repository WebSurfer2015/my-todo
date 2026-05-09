import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react'
import { Animated, StyleSheet, Text, TouchableOpacity, View, Platform } from 'react-native'
import { useTheme, ThemeColors } from './theme'

interface SnackbarOptions {
  message: string
  actionLabel?: string
  onAction?: () => void
  durationMs?: number
}

interface SnackbarState extends SnackbarOptions {
  id: number
}

interface NotifyApi {
  showSnackbar: (opts: SnackbarOptions) => void
}

const NotifyContext = createContext<NotifyApi>(null!)

const DEFAULT_DURATION = 4000

export function NotifyProvider({ children }: { children: ReactNode }) {
  const [snackbar, setSnackbar] = useState<SnackbarState | null>(null)
  const idRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const dismissSnackbar = useCallback(() => {
    setSnackbar(null)
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const showSnackbar = useCallback((opts: SnackbarOptions) => {
    const id = ++idRef.current
    setSnackbar({ ...opts, id })
    if (timerRef.current) clearTimeout(timerRef.current)
    const duration = opts.durationMs ?? DEFAULT_DURATION
    timerRef.current = setTimeout(() => {
      setSnackbar((cur) => (cur?.id === id ? null : cur))
      timerRef.current = null
    }, duration)
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

  return (
    <View style={styles.container} pointerEvents="box-none">
      <Animated.View
        style={[styles.snackbar, { transform: [{ translateY }], opacity }]}
        accessibilityRole="alert"
      >
        <Text style={styles.message} numberOfLines={2}>{message}</Text>
        {actionLabel && (
          <TouchableOpacity onPress={onAction} hitSlop={8}>
            <Text style={styles.action}>{actionLabel}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={onDismiss} hitSlop={8} style={styles.closeBtn}>
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
