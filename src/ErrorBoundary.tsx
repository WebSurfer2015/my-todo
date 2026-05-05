import { Component, ErrorInfo, ReactNode } from 'react'

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

  resetAndClear = () => {
    try { localStorage.clear() } catch { /* noop */ }
    window.location.reload()
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div style={wrapStyle}>
        <h1 style={titleStyle}>Something went wrong</h1>
        <pre style={preStyle}>{String(this.state.error.message || this.state.error)}</pre>
        <div style={actionsStyle}>
          <button type="button" onClick={this.reset} style={btnStyle}>Try again</button>
          <button type="button" onClick={this.resetAndClear} style={dangerStyle}>Reset all data and reload</button>
        </div>
      </div>
    )
  }
}

const wrapStyle: React.CSSProperties = {
  padding: 32,
  maxWidth: 640,
  margin: '64px auto',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
  color: '#111',
}
const titleStyle: React.CSSProperties = { fontSize: 22, marginBottom: 12 }
const preStyle: React.CSSProperties = {
  whiteSpace: 'pre-wrap',
  background: '#fee',
  padding: 12,
  borderRadius: 8,
  fontSize: 13,
  border: '1px solid #fbb',
}
const actionsStyle: React.CSSProperties = { marginTop: 16, display: 'flex', gap: 8 }
const btnStyle: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 8,
  border: '1px solid #ccc',
  background: '#fff',
  cursor: 'pointer',
}
const dangerStyle: React.CSSProperties = { ...btnStyle, color: '#c00', borderColor: '#fbb' }
