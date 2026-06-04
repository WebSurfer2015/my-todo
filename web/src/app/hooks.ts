import { useEffect, useRef, RefObject } from 'react'

export function useCloseOnOutside<T extends HTMLElement>(
  ref: RefObject<T>,
  isOpen: boolean,
  onClose: () => void,
) {
  const savedOnClose = useRef(onClose)
  savedOnClose.current = onClose

  useEffect(() => {
    if (!isOpen) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) savedOnClose.current()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') savedOnClose.current()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [isOpen, ref])
}
