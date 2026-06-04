import { Dispatch, SetStateAction, useEffect, useState } from 'react'
import { writeVersioned } from '../adapters/persistence'

export function usePersistedState<T>(
  key: string,
  loader: () => T,
): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState<T>(loader)
  useEffect(() => {
    writeVersioned(key, state)
  }, [key, state])
  return [state, setState]
}
