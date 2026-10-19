import React, { Component, ErrorInfo, ReactNode, useMemo, useState } from 'react'
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
  const [showDetails, setShowDetails] = useState(false)
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>{ERROR_FALLBACK_TITLE}</Text>
        <Text style={styles.lead}>{ERROR_FALLBACK_BODY}</Text>
        <View style={styles.actions}>
          <TouchableOpacity style={styles.btn} onPress={onRetry} accessibilityRole="button">
            <Text style={styles.btnText}>Try again</Text>
          </TouchableOpacity>
          {/* Clears only this device's local settings (the to-dos live in
              the account), so it's a neutral action, not a destructive one. */}
          <TouchableOpacity style={styles.btn} onPress={onResetAll} accessibilityRole="button">
            <Text style={styles.btnText}>Reset this device's settings</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          onPress={() => setShowDetails((v) => !v)}
          style={styles.detailsToggle}
          accessibilityRole="button"
          accessibilityState={{ expanded: showDetails }}
        >
          <Text style={styles.detailsToggleText}>{showDetails ? 'Hide details' : 'Details'}</Text>
        </TouchableOpacity>
        {showDetails && <Text style={styles.body}>{String(error.message || error)}</Text>}
      </ScrollView>
    </SafeAreaView>
  )
}

const ERROR_FALLBACK_TITLE = 'Something went sideways.'
const ERROR_FALLBACK_BODY = 'Your to-dos are safe in your account.'

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.bg },
    container: { padding: 24 },
    title: { fontSize: 22, fontWeight: '700', marginBottom: 8, color: c.label },
    lead: { fontSize: 15, color: c.label2 },
    detailsToggle: { alignSelf: 'center', marginTop: 20, paddingVertical: 8 },
    detailsToggleText: { fontSize: 13, fontWeight: '500', color: c.label2 },
    body: {
      fontSize: 13,
      fontFamily: 'Menlo',
      backgroundColor: c.card,
      color: c.label2,
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
    btnText: { fontSize: 15, fontWeight: '600', color: c.label },
  })
}
