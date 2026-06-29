import { useEffect, useRef } from 'react'
import {
  Animated,
  PanResponder,
  type PanResponderInstance,
  StyleSheet,
  useWindowDimensions,
} from 'react-native'

/** Shared grab-zone wrapper for the handle: spread the hook's panHandlers on a
 * View with this style so swipe-to-dismiss has a comfortable hit area without
 * enlarging the visible grabber. */
export const sheetGrabZone = StyleSheet.create({
  zone: { alignItems: 'center', paddingTop: 8, paddingBottom: 10 },
}).zone

/**
 * Swipe-to-dismiss for bottom sheets — the #1 learned sheet gesture, which the
 * app's grabber only *implied* (it was decorative). Returns a `translateY`
 * Animated value to drive the sheet container's transform and `panHandlers` to
 * spread on the GRABBER region only (never the scroll body or header buttons,
 * so it can't fight inner scrolling or steal taps).
 *
 * Drag the grabber down: the sheet follows the finger; release past ~90pt (or a
 * flick) animates it off-screen and calls `onClose`, otherwise it springs back.
 * Resets to rest whenever the sheet (re)opens, so the next present starts clean.
 */
export function useSheetDismiss(
  visible: boolean,
  onClose: () => void,
  opts?: {
    /**
     * Set when `onClose` may NOT actually close — it pops a "Discard?" confirm
     * or routes back to a sub-list (Compose, Chat, Category, Task Details). In
     * that case a release springs the sheet back to rest BEFORE running the
     * handler, so a cancelled confirm leaves it settled in place instead of
     * stranded off-screen. Default false: slide off-screen, then close.
     */
    confirmsClose?: boolean
  },
): { translateY: Animated.Value; panHandlers: PanResponderInstance['panHandlers'] } {
  const { height } = useWindowDimensions()
  const translateY = useRef(new Animated.Value(0)).current
  // Keep the latest onClose / height / opts without recreating the PanResponder.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const heightRef = useRef(height)
  heightRef.current = height
  const confirmsCloseRef = useRef(opts?.confirmsClose ?? false)
  confirmsCloseRef.current = opts?.confirmsClose ?? false

  // Snap back to the resting position every time the sheet opens (the dismiss
  // path leaves it translated off-screen).
  useEffect(() => {
    if (visible) translateY.setValue(0)
  }, [visible, translateY])

  const responder = useRef<PanResponderInstance | null>(null)
  if (responder.current === null) {
    const springBack = () =>
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        bounciness: 4,
      }).start()
    responder.current = PanResponder.create({
      // Don't claim the touch on start — let header buttons / the grabber's own
      // taps through. Only a deliberate downward drag captures the gesture.
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_e, g) => g.dy > 4 && g.dy > Math.abs(g.dx),
      onPanResponderMove: (_e, g) => {
        if (g.dy > 0) translateY.setValue(g.dy)
      },
      onPanResponderRelease: (_e, g) => {
        if (g.dy > 90 || g.vy > 0.6) {
          if (confirmsCloseRef.current) {
            // Settle back to rest, then run the (possibly-confirming) handler.
            springBack()
            onCloseRef.current()
          } else {
            Animated.timing(translateY, {
              toValue: heightRef.current,
              duration: 180,
              useNativeDriver: true,
            }).start(() => onCloseRef.current())
          }
        } else {
          springBack()
        }
      },
      onPanResponderTerminate: springBack,
    })
  }

  return { translateY, panHandlers: responder.current.panHandlers }
}
