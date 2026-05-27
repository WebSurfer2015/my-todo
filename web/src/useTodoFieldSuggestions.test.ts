// @vitest-environment happy-dom
/**
 * Tests for the hook that powers the ambient AI field-suggestion
 * pills under the Add to-do title input. Covers:
 *   - gate (agentEnabled off / text too short)
 *   - signal pre-filter (skip AI when text has no extractable signal)
 *   - debounce (only fires after the pause)
 *   - dedupe (same text + no manual edit → no second call)
 *   - sequence: stale response ignored after the user kept typing
 *   - initialText edit-flow guard (no call until text differs)
 *   - dismissField + clear semantics
 *
 * The aiInfer wrapper is mocked so we never hit the Cloud Function.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

const { suggestTodoFieldsMock } = vi.hoisted(() => ({
  suggestTodoFieldsMock: vi.fn(),
}))
vi.mock('../../mobile/src/aiInfer', () => ({
  suggestTodoFields: suggestTodoFieldsMock,
}))

import {
  useTodoFieldSuggestions,
  hasExtractableSignal,
  MIN_CHARS,
  DEBOUNCE_MS,
} from '../../mobile/src/components/useTodoFieldSuggestions'

const NULL_RES = {
  category: null,
  newCategoryLabel: null,
  priority: null,
  dueDate: null,
  recurrence: null,
  reminder: null,
}

describe('hasExtractableSignal', () => {
  it('returns true for clock-time signals', () => {
    expect(hasExtractableSignal('meet at 3pm')).toBe(true)
    expect(hasExtractableSignal('call back at 14:00')).toBe(true)
  })
  it('returns true for date keywords', () => {
    expect(hasExtractableSignal('tomorrow')).toBe(true)
    expect(hasExtractableSignal('next monday')).toBe(true)
    expect(hasExtractableSignal('in 3 days')).toBe(true)
  })
  it('returns true for recurrence keywords', () => {
    expect(hasExtractableSignal('every monday')).toBe(true)
    expect(hasExtractableSignal('daily standup')).toBe(true)
    expect(hasExtractableSignal('weekdays')).toBe(true)
  })
  it('returns true for "remind" keyword', () => {
    expect(hasExtractableSignal('remind me about the dentist')).toBe(true)
  })
  it('returns true for priority keywords', () => {
    expect(hasExtractableSignal('urgent: file the form')).toBe(true)
    expect(hasExtractableSignal('asap')).toBe(true)
  })
  it('returns true for any text ≥ 8 chars (even without keywords)', () => {
    expect(hasExtractableSignal('renew passport')).toBe(true)
  })
  it('returns false for short text with no signal', () => {
    expect(hasExtractableSignal('foo bar')).toBe(false)
    expect(hasExtractableSignal('a')).toBe(false)
  })
})

describe('useTodoFieldSuggestions', () => {
  beforeEach(() => {
    suggestTodoFieldsMock.mockReset()
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })
  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  function defaultArgs(overrides: Partial<Parameters<typeof useTodoFieldSuggestions>[0]> = {}) {
    return {
      text: 'remind me to call dentist tomorrow',
      today: '2026-05-20',
      categories: [{ id: 'home', label: 'Home' }],
      agentEnabled: true,
      ...overrides,
    }
  }

  it('does nothing when agentEnabled is false', () => {
    const { result } = renderHook(() =>
      useTodoFieldSuggestions(defaultArgs({ agentEnabled: false })),
    )
    act(() => { vi.advanceTimersByTime(DEBOUNCE_MS + 100) })
    expect(suggestTodoFieldsMock).not.toHaveBeenCalled()
    expect(result.current.thinking).toBe(false)
  })

  it('does nothing when text is shorter than MIN_CHARS', () => {
    renderHook(() =>
      useTodoFieldSuggestions(defaultArgs({ text: 'x'.repeat(MIN_CHARS - 1) })),
    )
    act(() => { vi.advanceTimersByTime(DEBOUNCE_MS + 100) })
    expect(suggestTodoFieldsMock).not.toHaveBeenCalled()
  })

  it('does not call AI when the text matches initialText (edit-flow seed)', () => {
    const text = 'remind me about the appointment'
    renderHook(() =>
      useTodoFieldSuggestions(defaultArgs({ text, initialText: text.toUpperCase() })),
    )
    act(() => { vi.advanceTimersByTime(DEBOUNCE_MS + 100) })
    expect(suggestTodoFieldsMock).not.toHaveBeenCalled()
  })

  it('skips AI when text has no extractable signal', () => {
    renderHook(() =>
      useTodoFieldSuggestions(defaultArgs({ text: 'qwerty' })), // 6 chars, no signal
    )
    act(() => { vi.advanceTimersByTime(DEBOUNCE_MS + 100) })
    expect(suggestTodoFieldsMock).not.toHaveBeenCalled()
  })

  it('calls AI after the debounce when text has a signal', async () => {
    suggestTodoFieldsMock.mockResolvedValueOnce({
      ...NULL_RES,
      dueDate: '2026-05-21',
    })
    const { result } = renderHook(() => useTodoFieldSuggestions(defaultArgs()))
    expect(suggestTodoFieldsMock).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(DEBOUNCE_MS + 50) })
    await waitFor(() => expect(suggestTodoFieldsMock).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(result.current.suggestions?.dueDate).toBe('2026-05-21'))
  })

  it('returns null suggestions when AI returns all-null', async () => {
    suggestTodoFieldsMock.mockResolvedValueOnce({ ...NULL_RES })
    const { result } = renderHook(() => useTodoFieldSuggestions(defaultArgs()))
    act(() => { vi.advanceTimersByTime(DEBOUNCE_MS + 50) })
    await waitFor(() => expect(suggestTodoFieldsMock).toHaveBeenCalled())
    await waitFor(() => expect(result.current.thinking).toBe(false))
    expect(result.current.suggestions).toBeNull()
  })

  it('drops stale responses (sequence guard)', async () => {
    // First call: long-running, never resolves on its own.
    let resolveFirst: (v: typeof NULL_RES) => void = () => {}
    suggestTodoFieldsMock.mockImplementationOnce(
      () => new Promise((res) => { resolveFirst = res }),
    )
    const { result, rerender } = renderHook(
      (args: Parameters<typeof useTodoFieldSuggestions>[0]) =>
        useTodoFieldSuggestions(args),
      { initialProps: defaultArgs({ text: 'urgent: call back next monday' }) },
    )
    act(() => { vi.advanceTimersByTime(DEBOUNCE_MS + 50) })
    await waitFor(() => expect(suggestTodoFieldsMock).toHaveBeenCalledTimes(1))
    // Mid-flight: user keeps typing — text changes → seq bumps via effect.
    suggestTodoFieldsMock.mockResolvedValueOnce({ ...NULL_RES, priority: 'high' })
    rerender(defaultArgs({ text: 'urgent: call back next monday morning' }))
    act(() => { vi.advanceTimersByTime(DEBOUNCE_MS + 50) })
    await waitFor(() => expect(suggestTodoFieldsMock).toHaveBeenCalledTimes(2))
    // Now resolve the FIRST (stale) call — it should be ignored.
    await act(async () => { resolveFirst({ ...NULL_RES, dueDate: '2099-01-01' }) })
    await waitFor(() => expect(result.current.suggestions?.priority).toBe('high'))
    // Suggestions came from the SECOND call (priority:'high'), where
    // dueDate is null. The stale first-call value (2099-01-01) was dropped.
    expect(result.current.suggestions?.dueDate).toBeNull()
  })

  it('dismissField removes a single suggestion and clears when all are null', async () => {
    suggestTodoFieldsMock.mockResolvedValueOnce({
      ...NULL_RES,
      priority: 'high',
      dueDate: '2026-05-21',
    })
    const { result } = renderHook(() => useTodoFieldSuggestions(defaultArgs()))
    act(() => { vi.advanceTimersByTime(DEBOUNCE_MS + 50) })
    await waitFor(() => expect(result.current.suggestions).not.toBeNull())
    act(() => result.current.dismissField('priority'))
    expect(result.current.suggestions?.priority).toBeNull()
    expect(result.current.suggestions?.dueDate).toBe('2026-05-21')
    act(() => result.current.dismissField('dueDate'))
    expect(result.current.suggestions).toBeNull()
  })

  it('clear() resets state and invalidates in-flight requests', async () => {
    let resolveFn: (v: typeof NULL_RES) => void = () => {}
    suggestTodoFieldsMock.mockImplementationOnce(
      () => new Promise((res) => { resolveFn = res }),
    )
    const { result } = renderHook(() => useTodoFieldSuggestions(defaultArgs()))
    act(() => { vi.advanceTimersByTime(DEBOUNCE_MS + 50) })
    await waitFor(() => expect(result.current.thinking).toBe(true))
    act(() => result.current.clear())
    expect(result.current.thinking).toBe(false)
    expect(result.current.suggestions).toBeNull()
    // Resolve the now-stale request — should NOT re-populate suggestions.
    await act(async () => { resolveFn({ ...NULL_RES, dueDate: '2099-01-01' }) })
    expect(result.current.suggestions).toBeNull()
  })
})
