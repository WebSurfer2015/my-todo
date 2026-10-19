import { useCallback, useRef, useState } from 'react'
import { undoOutcome, type UndoFn } from './undoOutcome'

/** An applied chat card's inline Undo: `idle` until pressed; `undone` only
 * when the Undo actually put something back; `nothing` when it reported
 * nothing to undo (everything it touched changed since, or it was retired) —
 * so the card never claims "Undone" for a no-op. A second press while one is
 * running is ignored. */
export type InlineUndoState = 'idle' | 'undone' | 'nothing'

export function useInlineUndo(undo: UndoFn | null): { state: InlineUndoState; run: () => Promise<void> } {
  const [state, setState] = useState<InlineUndoState>('idle')
  const runningRef = useRef(false)
  const run = useCallback(async () => {
    if (!undo || runningRef.current) return
    runningRef.current = true
    try {
      setState((await undoOutcome(undo)) ? 'undone' : 'nothing')
    } finally {
      runningRef.current = false
    }
  }, [undo])
  return { state, run }
}
