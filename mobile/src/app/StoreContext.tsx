/**
 * Single-source-of-truth provider for the domain store. Each tab screen
 * needs to read the same `todos` / `categories` / `groceries` / `profile`
 * state; calling `useTodoStore()` once per screen would spin up parallel
 * Firestore listeners and re-run `migrateLocalToCloud` per mount. This
 * context calls the store hook exactly once at the app shell and hands
 * the value down to every screen.
 */
import React, { createContext, useContext, ReactNode } from 'react'
import { useTodoStore } from '../store/useTodoStore'

type Store = ReturnType<typeof useTodoStore>

const StoreContext = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const store = useTodoStore()
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>
}

export function useStore(): Store {
  const s = useContext(StoreContext)
  if (!s) throw new Error('useStore must be used inside StoreProvider')
  return s
}
