/**
 * Ask Mochi's inline Undo: only the MOST RECENT applied turn keeps it.
 *
 * Chat Undos restore what a turn changed (snapshot / tracked reverts). With
 * every older turn's Undo still live, undoing an old turn could overwrite a
 * newer turn's edit of the same to-do. Simplest mental model: once a newer
 * turn applies changes, older turns read "✓ Done" with no Undo.
 *
 * The executor (useMochiExecutor) calls `beginMochiTurn()` once a turn has
 * actually applied something (not for a cancelled confirm or an empty plan)
 * and wraps that turn's Undo(s) with the returned `stamp`. A stale Undo is a
 * no-op that reports `false` (nothing undone); the chat hides it via
 * `isUndoLive` / `useUndoLive`. Undos that were never stamped stay live.
 */
import { useCallback, useSyncExternalStore } from 'react'

let latest = 0
const stamps = new WeakMap<object, number>()
const listeners = new Set<() => void>()

/** A Mochi turn applied changes: every earlier turn's Undo retires. Returns
 * the wrapper that stamps this turn's Undo(s). */
export function beginMochiTurn(): <R>(fn: () => R) => () => R | false {
  const gen = ++latest
  listeners.forEach((l) => l())
  return <R>(fn: () => R) => {
    const guarded = (): R | false => (gen === latest ? fn() : false)
    stamps.set(guarded, gen)
    return guarded
  }
}

/** False once a newer Mochi turn applied changes (or for no Undo at all). */
export function isUndoLive(fn: unknown): boolean {
  if (typeof fn !== 'function') return false
  const gen = stamps.get(fn)
  return gen === undefined || gen === latest
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** `isUndoLive`, re-rendering when a newer turn retires it. */
export function useUndoLive(fn: unknown): boolean {
  const get = useCallback(() => isUndoLive(fn), [fn])
  return useSyncExternalStore(subscribe, get, get)
}
