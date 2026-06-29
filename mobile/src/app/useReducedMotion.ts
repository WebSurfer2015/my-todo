import { useEffect, useState } from 'react'
import { AccessibilityInfo } from 'react-native'

/**
 * Live OS-level "Reduce Motion" accessibility setting (iOS Settings →
 * Accessibility → Motion; Android → Remove animations).
 *
 * The app's motion gating used to depend ONLY on the in-app Settings toggle
 * (`profile.reduceMotion`), so a user who had turned Reduce Motion on at the
 * OS level still got the full pebble flight / checkbox bounce / avatar dance.
 * Fold this into the animation gate so the system preference is honored
 * without the user having to discover the in-app switch.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    let alive = true
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (alive) setReduced(v)
    })
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced)
    return () => {
      alive = false
      sub.remove()
    }
  }, [])
  return reduced
}
