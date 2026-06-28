import React, { Component, ErrorInfo, ReactNode, useMemo } from 'react'
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import crashlytics from '@react-native-firebase/crashlytics'
import { clearAllPersisted } from '../adapters/persistence'
import { useTheme, ThemeColors } from './theme'

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info)
    // Forward to Firebase Crashlytics. No-ops gracefully until Crashlytics
    // is enabled in the Firebase Console (Console → Crashlytics → Get
    // started). Native crashes are auto-collected; this catches JS errors.
    try {
      crashlytics().log(`ErrorBoundary: ${info.componentStack ?? '(no stack)'}`)
      crashlytics().recordError(error)
    } catch {
      // Defensive — don't crash the crash reporter
    }
  }

  reset = () => {
    this.setState({ error: null })
  }

  resetAndClear = async () => {
    await clearAllPersisted()
    this.setState({ error: null })
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <ErrorFallback
        error={this.state.error}
        onRetry={this.reset}
        onResetAll={this.resetAndClear}
      />
    )
  }
}

/** Themed fallback — a functional child so it can read the palette via
 * useTheme() (keyed off useColorScheme, no provider needed), keeping the
 * crash screen calm and on-theme in dark mode instead of a jarring white. */
function ErrorFallback({
  error,
  onRetry,
  onResetAll,
}: {
  error: Error
  onRetry: () => void
  onResetAll: () => void
}) {
  const c = useTheme()
  const styles = useMemo(() => makeStyles(c), [c])
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.body}>{String(error.message || error)}</Text>
        <View style={styles.actions}>
          <TouchableOpacity style={styles.btn} onPress={onRetry}>
            <Text style={styles.btnText}>Try again</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.btnDanger]} onPress={onResetAll}>
            <Text style={[styles.btnText, styles.btnTextDanger]}>Reset all data</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.bg },
    container: { padding: 24 },
    title: { fontSize: 22, fontWeight: '700', marginBottom: 12, color: c.label },
    body: {
      fontSize: 13,
      fontFamily: 'Menlo',
      backgroundColor: c.card,
      color: c.red,
      padding: 12,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.separator,
    },
    actions: { marginTop: 24, gap: 8 },
    btn: {
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 10,
      backgroundColor: c.card,
      alignItems: 'center',
    },
    btnDanger: { borderWidth: StyleSheet.hairlineWidth, borderColor: c.red },
    btnText: { fontSize: 15, fontWeight: '600', color: c.label },
    btnTextDanger: { color: c.red },
  })
}
