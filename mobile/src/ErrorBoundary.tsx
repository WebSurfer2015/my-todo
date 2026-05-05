import React, { Component, ErrorInfo, ReactNode } from 'react'
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { clearAllPersisted } from './persistence'

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
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.body}>{String(this.state.error.message || this.state.error)}</Text>
          <View style={styles.actions}>
            <TouchableOpacity style={styles.btn} onPress={this.reset}>
              <Text style={styles.btnText}>Try again</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.btnDanger]} onPress={this.resetAndClear}>
              <Text style={[styles.btnText, styles.btnTextDanger]}>Reset all data</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    )
  }
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  container: { padding: 24 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 12, color: '#111' },
  body: {
    fontSize: 13,
    fontFamily: 'Menlo',
    backgroundColor: '#fee',
    color: '#900',
    padding: 12,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#fbb',
  },
  actions: { marginTop: 20, gap: 10 },
  btn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#f2f2f2',
    alignItems: 'center',
  },
  btnDanger: { backgroundColor: '#fee', borderWidth: StyleSheet.hairlineWidth, borderColor: '#fbb' },
  btnText: { fontSize: 15, fontWeight: '600', color: '#111' },
  btnTextDanger: { color: '#c00' },
})
