import { useCallback, useRef, useState } from 'react'
import { undoResult, type UndoFn, type UndoResult } from './undoOutcome'

/** An applied chat card's inline Undo: `idle` until pressed, then what the
 * Undo did — `undone` only when it actually put something back, `partial`
 * when later changes were kept, `nothing` when it reported nothing to undo
 * (everything it touched changed since, or it was retired) — so the card
 * never claims "Undone" for a no-op. */
export type InlineUndoState = 'idle' | UndoResult

/** One card's inline Undo. A second press while one is running — or after
 * it already ran — is ignored. */
export function useInlineUndo(undo: UndoFn | null): { state: InlineUndoState; run: () => Promise<void> } {
  const [state, setState] = useState<InlineUndoState>('idle')
  const runningRef = useRef(false)
  const doneRef = useRef(false)
  const run = useCallback(async () => {
    if (!undo || runningRef.current || doneRef.current) return
    runningRef.current = true
    try {
      setState(await undoResult(undo))
      doneRef.current = true
    } finally {
      runningRef.current = false
    }
  }, [undo])
  return { state, run }
}

/** The inline Undos of a whole conversation, keyed by turn index (the chat's
 * confirmed-turn footers and captured-to-do cards). `run(key, undo)` runs a
 * turn's Undo at most once: a fast double tap while it runs, or a tap after
 * it ran, resolves null and runs nothing. Every result is recorded —
 * including `nothing` — so a card can say "Nothing to undo" instead of
 * keeping a dead Undo button. */
export function useInlineUndos(): {
  results: Record<number, UndoResult>
  run: (key: number, undo: UndoFn | null | undefined) => Promise<UndoResult | null>
  clear: () => void
} {
  const [results, setResults] = useState<Record<number, UndoResult>>({})
  const startedRef = useRef<Set<number>>(new Set())
  // Bumped by clear(), so a result from a cleared conversation never lands
  // on a new conversation's turn at the same index.
  const genRef = useRef(0)
  const run = useCallback(async (key: number, undo: UndoFn | null | undefined): Promise<UndoResult | null> => {
    if (!undo || startedRef.current.has(key)) return null
    startedRef.current.add(key)
    const gen = genRef.current
    let r: UndoResult
    try {
      r = await undoResult(undo)
    } catch (e) {
      // A throwing Undo may be tried again.
      if (gen === genRef.current) startedRef.current.delete(key)
      throw e
    }
    if (gen !== genRef.current) return null
    setResults((prev) => ({ ...prev, [key]: r }))
    return r
  }, [])
  const clear = useCallback(() => {
    genRef.current += 1
    startedRef.current = new Set()
    setResults({})
  }, [])
  return { results, run, clear }
}
