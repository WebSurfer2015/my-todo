import { useEffect, useState } from 'react'
import { AccessibilityInfo } from 'react-native'

/**
 * Subscribes to the OS-level "Reduce Motion" accessibility setting and returns
 * its current value. Use this to skip non-essential animations (splash breath,
 * row done-flash, checkbox bounce) when the user has asked the system to
 * minimize motion.
 */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false)
  useEffect(() => {
    let mounted = true
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (mounted) setReduce(v)
    }).catch(() => {})
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce)
    return () => {
      mounted = false
      sub.remove()
    }
  }, [])
  return reduce
}
