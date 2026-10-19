// @vitest-environment happy-dom
/**
 * Ask Mochi's applied-card inline Undo: flips to "Undone" only when the store
 * Undo reports it put something back (store Undos return false otherwise).
 */
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { useInlineUndo, useInlineUndos } from '../features/mochi/useInlineUndo'

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

describe('useInlineUndo — after it ran', () => {
  it('a press after the Undo already ran does nothing', async () => {
    const undo = vi.fn(() => false)
    const { result } = renderHook(() => useInlineUndo(undo))
    await act(() => result.current.run())
    await act(() => result.current.run())
    expect(undo).toHaveBeenCalledTimes(1)
    expect(result.current.state).toBe('nothing')
  })

  it('a partial Undo → partial', async () => {
    const { result } = renderHook(() => useInlineUndo(() => 'partial'))
    await act(() => result.current.run())
    expect(result.current.state).toBe('partial')
    const later = renderHook(() => useInlineUndo(() => Promise.resolve('partial' as const)))
    await act(() => later.result.current.run())
    expect(later.result.current.state).toBe('partial')
  })
})

describe('useInlineUndos (chat turn footers + capture cards)', () => {
  it("records 'nothing' instead of dropping it", async () => {
    const { result } = renderHook(() => useInlineUndos())
    let r: unknown
    await act(async () => {
      r = await result.current.run(3, () => false)
    })
    expect(r).toBe('nothing')
    expect(result.current.results[3]).toBe('nothing')
  })

  it('records undone / partial per turn', async () => {
    const { result } = renderHook(() => useInlineUndos())
    await act(async () => {
      await result.current.run(1, () => true)
      await result.current.run(2, () => 'partial')
    })
    expect(result.current.results).toEqual({ 1: 'undone', 2: 'partial' })
  })

  it('a fast double tap runs a combined Undo once', async () => {
    let resolveUndo!: (v: boolean) => void
    const undo = vi.fn(() => new Promise<boolean>((r) => { resolveUndo = r }))
    const { result } = renderHook(() => useInlineUndos())
    let first!: Promise<unknown>
    let second!: Promise<unknown>
    act(() => {
      first = result.current.run(0, undo)
      second = result.current.run(0, undo)
    })
    await act(async () => {
      resolveUndo(true)
      await first
    })
    expect(await second).toBeNull()
    expect(undo).toHaveBeenCalledTimes(1)
    expect(result.current.results[0]).toBe('undone')
    // …and a tap after it ran runs nothing either.
    let third: unknown
    await act(async () => {
      third = await result.current.run(0, undo)
    })
    expect(third).toBeNull()
    expect(undo).toHaveBeenCalledTimes(1)
  })

  it('no Undo → nothing runs, nothing recorded', async () => {
    const { result } = renderHook(() => useInlineUndos())
    await act(async () => {
      await result.current.run(0, null)
    })
    expect(result.current.results).toEqual({})
  })

  it('clear() forgets results, and a late result from before it is dropped', async () => {
    let resolveUndo!: (v: boolean) => void
    const { result } = renderHook(() => useInlineUndos())
    let pending!: Promise<unknown>
    act(() => {
      pending = result.current.run(0, () => new Promise<boolean>((r) => { resolveUndo = r }))
    })
    act(() => result.current.clear())
    await act(async () => {
      resolveUndo(true)
      await pending
    })
    expect(result.current.results).toEqual({})
    // The index is usable again in the new conversation.
    await act(async () => {
      await result.current.run(0, () => true)
    })
    expect(result.current.results[0]).toBe('undone')
  })
})

describe('ChatSheet / capture card wiring (source guard)', () => {
  const chat = readFileSync(resolve(__dirname, '../features/mochi/ChatSheet.tsx'), 'utf8')
  const card = readFileSync(resolve(__dirname, '../features/mochi/EditableCaptureCard.tsx'), 'utf8')

  it("the confirmed-turn footer runs through useInlineUndos and renders 'nothing'", () => {
    expect(chat).toMatch(/useInlineUndos\(\)/)
    expect(chat).toMatch(/undone\[i\] === 'nothing'/)
    expect(chat).toMatch(/Nothing to undo/)
    expect(chat).not.toMatch(/PARTIAL_UNDO_NOTE/)
  })

  it('the capture card guards its removal and shows what it did', () => {
    expect(card).toMatch(/removingRef\.current/)
    expect(card).toMatch(/captureCardRemovalNote\(removal\)/)
  })
})
