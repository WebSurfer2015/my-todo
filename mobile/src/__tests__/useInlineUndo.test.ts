// @vitest-environment happy-dom
/**
 * Ask Mochi's applied-card inline Undo: flips to "Undone" only when the store
 * Undo reports it put something back (store Undos return false otherwise).
 */
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useInlineUndo } from '../features/mochi/useInlineUndo'

describe('useInlineUndo', () => {
  it('a store Undo that reverted → undone', async () => {
    const undo = vi.fn(() => true)
    const { result } = renderHook(() => useInlineUndo(undo))
    expect(result.current.state).toBe('idle')
    await act(() => result.current.run())
    expect(undo).toHaveBeenCalledTimes(1)
    expect(result.current.state).toBe('undone')
  })

  it('a store Undo that reverted nothing (false) → nothing, not "Undone"', async () => {
    const { result } = renderHook(() => useInlineUndo(() => false))
    await act(() => result.current.run())
    expect(result.current.state).toBe('nothing')
  })

  it('a confirm-first Undo resolves its answer; a void Undo counts as done', async () => {
    const asks = renderHook(() => useInlineUndo(() => Promise.resolve(false)))
    await act(() => asks.result.current.run())
    expect(asks.result.current.state).toBe('nothing')
    const plain = renderHook(() => useInlineUndo(() => {}))
    await act(() => plain.result.current.run())
    expect(plain.result.current.state).toBe('undone')
  })

  it('a second press while the first is pending runs the Undo once', async () => {
    let resolve!: (v: boolean) => void
    const undo = vi.fn(() => new Promise<boolean>((r) => { resolve = r }))
    const { result } = renderHook(() => useInlineUndo(undo))
    let first!: Promise<void>
    act(() => {
      first = result.current.run()
      void result.current.run()
    })
    await act(async () => {
      resolve(true)
      await first
    })
    expect(undo).toHaveBeenCalledTimes(1)
    expect(result.current.state).toBe('undone')
  })

  it('no Undo → nothing runs', async () => {
    const { result } = renderHook(() => useInlineUndo(null))
    await act(() => result.current.run())
    expect(result.current.state).toBe('idle')
  })
})
