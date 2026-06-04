// @vitest-environment happy-dom
/**
 * Tests for mobile/src/components/SuggestStepsPanel.tsx → useSuggestSteps.
 *
 * The hook is a request-lifecycle state machine: idle → thinking →
 * (suggestions | error). We mock the network wrapper so we never hit
 * the Cloud Function, and assert the visible state at each step.
 *
 * Also mocks LangContext + theme since the hook imports the lang
 * provider for the error string.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// vi.hoisted lifts the mock fn declaration above vi.mock's auto-hoist,
// so it's defined when the factory runs at module-load time.
const { suggestSubtasksMock } = vi.hoisted(() => ({
  suggestSubtasksMock: vi.fn(),
}))
vi.mock('../../mobile/src/adapters/aiInfer', () => ({
  suggestSubtasks: suggestSubtasksMock,
}))
vi.mock('../../mobile/src/app/LangContext', () => ({
  useLang: () => ({
    t: { suggestStepsError: 'Could not suggest steps.' },
    lang: 'en',
    toggle: vi.fn(),
  }),
}))

import { useSuggestSteps } from '../../mobile/src/features/task/useSuggestSteps'

describe('useSuggestSteps', () => {
  beforeEach(() => {
    suggestSubtasksMock.mockReset()
  })

  it('starts idle: not thinking, no suggestions, no error', () => {
    const { result } = renderHook(() => useSuggestSteps({ parentTitle: 'Plan trip' }))
    expect(result.current.thinking).toBe(false)
    expect(result.current.suggestions).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it('flips thinking true during the in-flight request and false after', async () => {
    let resolveFn: (v: { subtasks: { text: string }[] }) => void = () => {}
    suggestSubtasksMock.mockReturnValueOnce(
      new Promise((res) => {
        resolveFn = res
      }),
    )
    const { result } = renderHook(() => useSuggestSteps({ parentTitle: 'Plan trip' }))
    act(() => {
      void result.current.request()
    })
    expect(result.current.thinking).toBe(true)
    await act(async () => {
      resolveFn({ subtasks: [{ text: 'Book flight' }, { text: 'Pack bag' }] })
    })
    await waitFor(() => expect(result.current.thinking).toBe(false))
    expect(result.current.suggestions).toEqual(['Book flight', 'Pack bag'])
    expect(result.current.error).toBeNull()
  })

  it('filters out empty subtask strings', async () => {
    suggestSubtasksMock.mockResolvedValueOnce({
      subtasks: [{ text: '' }, { text: 'Real step' }, { text: '  ' }],
    })
    const { result } = renderHook(() => useSuggestSteps({ parentTitle: 'X' }))
    await act(async () => {
      await result.current.request()
    })
    expect(result.current.suggestions).toEqual(['Real step'])
  })

  it('surfaces error when the response has zero usable subtasks', async () => {
    suggestSubtasksMock.mockResolvedValueOnce({ subtasks: [] })
    const { result } = renderHook(() => useSuggestSteps({ parentTitle: 'X' }))
    await act(async () => {
      await result.current.request()
    })
    expect(result.current.suggestions).toBeNull()
    expect(result.current.error).toBe('Could not suggest steps.')
  })

  it('surfaces error when the request throws', async () => {
    suggestSubtasksMock.mockRejectedValueOnce(new Error('network'))
    const { result } = renderHook(() => useSuggestSteps({ parentTitle: 'X' }))
    await act(async () => {
      await result.current.request()
    })
    expect(result.current.suggestions).toBeNull()
    expect(result.current.error).toBe('Could not suggest steps.')
    expect(result.current.thinking).toBe(false)
  })

  it('reset() clears suggestions + error without firing a new request', async () => {
    suggestSubtasksMock.mockResolvedValueOnce({
      subtasks: [{ text: 'A' }],
    })
    const { result } = renderHook(() => useSuggestSteps({ parentTitle: 'X' }))
    await act(async () => { await result.current.request() })
    expect(result.current.suggestions).toEqual(['A'])
    act(() => result.current.reset())
    expect(result.current.suggestions).toBeNull()
    expect(result.current.error).toBeNull()
    expect(suggestSubtasksMock).toHaveBeenCalledTimes(1)
  })

  it('passes notes through to suggestSubtasks when provided', async () => {
    suggestSubtasksMock.mockResolvedValueOnce({ subtasks: [{ text: 'X' }] })
    const { result } = renderHook(() =>
      useSuggestSteps({ parentTitle: 'Plan trip', parentNotes: 'New Zealand' }),
    )
    await act(async () => { await result.current.request() })
    expect(suggestSubtasksMock).toHaveBeenCalledWith({
      title: 'Plan trip',
      notes: 'New Zealand',
    })
  })
})
