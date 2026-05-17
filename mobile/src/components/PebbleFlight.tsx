import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { Animated, Easing, Image, StyleSheet, View } from 'react-native'
import { createAudioPlayer, setAudioModeAsync, AudioPlayer } from 'expo-audio'
import { useReduceMotion } from '../useReduceMotion'

/**
 * Cross-component overlay: when a task transitions to done, a Mochi sprite
 * arcs from the row up to the slot where the new pebble will materialize
 * on the strip, dwells while the real pebble appears (PebbleStrip re-
 * renders when `applyPebbleDeltaTimed` fires its deferred increment), and
 * fades out leaving the user looking at the placed pebble.
 *
 * Phases (FLIGHT_MS = 1800):
 *   0.00 → 0.40  Mochi arcs from row to target (ease-out)
 *   0.40 → 0.78  Mochi dwells at target (gives the real pebble time to
 *                materialize ~940ms in via the store's deferred increment)
 *   0.52         Chime fires (synced with the pebble's appearance)
 *   0.78 → 1.00  Mochi fades out; the real pebble remains in the strip
 *
 * No grey "fake pebble" is drawn in this overlay — the actual pebble is
 * rendered by PebbleStrip on the next re-render, so the user sees the
 * cairn count grow rather than a hand-off animation.
 *
 * Honors reduce-motion (animation no-op, chime still plays). Multiple
 * concurrent flights are supported.
 */

interface Point { x: number; y: number }

interface Flight {
  id: number
  from: Point
  to: Point
  /** Whether the chime should fire at landing for this flight. False
   * when the user has turned the completion sound off in Profile. */
  chime: boolean
}

interface TriggerOptions {
  /** Spawn the Mochi flight overlay. Default true. Reduce-motion at the
   * OS level overrides this to false. */
  animate?: boolean
  /** Play the completion chime. Default true. */
  chime?: boolean
}

interface Ctx {
  registerCairn: (p: Point | null) => void
  trigger: (from: Point, opts?: TriggerOptions) => void
}

const PebbleFlightCtx = createContext<Ctx | null>(null)

// ── shared sound (preloaded once per provider lifetime) ─────────────────
let sharedPlayer: AudioPlayer | null = null
let audioModeReady = false

function ensureSound() {
  if (!audioModeReady) {
    // Opt audio into iOS silent mode so the chime plays regardless of
    // the ringer switch. expo-audio's setAudioModeAsync mirrors expo-av's.
    setAudioModeAsync({
      playsInSilentMode: true,
      allowsRecording: false,
      shouldPlayInBackground: false,
      shouldRouteThroughEarpiece: false,
      interruptionMode: 'mixWithOthers',
      interruptionModeAndroid: 'duckOthers',
    }).catch(() => {})
    audioModeReady = true
  }
  if (!sharedPlayer) {
    try {
      // createAudioPlayer loads the asset synchronously into a player
      // instance; subsequent play() calls are cheap and don't re-decode.
      sharedPlayer = createAudioPlayer(require('../../assets/sounds/complete.wav'))
      sharedPlayer.volume = 1.0
    } catch {
      sharedPlayer = null
    }
  }
}

function playChime() {
  try {
    ensureSound()
    if (!sharedPlayer) return
    // seekTo(0) ensures rapid-fire completions each start from the
    // beginning instead of compounding on the previous play.
    sharedPlayer.seekTo(0)
    sharedPlayer.play()
  } catch {
    // Silent fail — chime is optional, the haptic + visual still fire.
  }
}

export function PebbleFlightProvider({ children }: { children: React.ReactNode }) {
  const cairnRef = useRef<Point | null>(null)
  const [flights, setFlights] = useState<Flight[]>([])
  const nextIdRef = useRef(0)
  const reduceMotion = useReduceMotion()

  // Warm up the player on mount so the first chime doesn't lag while the
  // WAV decodes.
  useEffect(() => {
    ensureSound()
  }, [])

  const registerCairn = useCallback((p: Point | null) => {
    cairnRef.current = p
  }, [])

  const trigger = useCallback(
    (from: Point, opts?: TriggerOptions) => {
      const wantsAnimate = opts?.animate !== false && !reduceMotion
      const wantsChime = opts?.chime !== false
      const to = cairnRef.current
      if (!wantsAnimate || !to) {
        // Reduce-motion / animation off / no cairn registered yet → just
        // play the chime so the user still gets feedback.
        if (wantsChime) playChime()
        return
      }
      const id = nextIdRef.current++
      // FlyingMochi owns the chime when an animation is running so it
      // syncs to landing; suppress it here if chime is opted out.
      setFlights((prev) => [...prev, { id, from, to, chime: wantsChime }])
    },
    [reduceMotion],
  )

  const finish = useCallback((id: number) => {
    setFlights((prev) => prev.filter((f) => f.id !== id))
  }, [])

  return (
    <PebbleFlightCtx.Provider value={{ registerCairn, trigger }}>
      {children}
      {flights.length > 0 && (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          {flights.map((f) => (
            <FlyingMochi key={f.id} flight={f} onDone={() => finish(f.id)} />
          ))}
        </View>
      )}
    </PebbleFlightCtx.Provider>
  )
}

/** Cairn calls this on layout and on count change to publish the screen-
 * space target for the *next* pebble drop. Pass `null` to clear. */
export function useRegisterCairn() {
  const ctx = useContext(PebbleFlightCtx)
  return ctx ? ctx.registerCairn : () => {}
}

/** Trigger one flight from `from` (typically the row's screen-space
 * center) to the registered next-pebble target. Pass opts to selectively
 * suppress the animation or the chime when the user has those off. */
export function useTriggerPebbleFlight() {
  const ctx = useContext(PebbleFlightCtx)
  return ctx ? ctx.trigger : () => {}
}

// ── overlay sprite ────────────────────────────────────────────────────────

const MOCHI_SIZE = 56
const FLIGHT_MS = 1800
const LAND_AT = 0.40
const DROP_AT = 0.52
const FADE_START = 0.78
const DROP_MS = FLIGHT_MS * DROP_AT

/**
 * Time (ms) between a completion gesture and Mochi reaching the cairn
 * to drop the pebble. The store imports this and uses it to defer
 * `applyPebbleDelta` so the real pebble materializes on the strip at
 * the exact moment Mochi lands. Keep this exported so a single source
 * controls both the animation timing and the data update timing.
 */
export const PEBBLE_DEFERRAL_MS = DROP_MS

function FlyingMochi({ flight, onDone }: { flight: Flight; onDone: () => void }) {
  const progress = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: FLIGHT_MS,
      easing: Easing.bezier(0.42, 0.05, 0.5, 1),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onDone()
    })
    // Chime fires at the pebble-drop moment, which matches the store's
    // PEBBLE_DEFERRAL_MS so the real pebble materializes on the strip
    // at the same instant the user hears the sound. Skipped when the
    // trigger was opted out of audio.
    const t = flight.chime ? setTimeout(playChime, DROP_MS) : null
    return () => { if (t) clearTimeout(t) }
  }, [progress, onDone, flight.chime])

  const dx = flight.to.x - flight.from.x
  const dy = flight.to.y - flight.from.y
  // Lift higher than the straight line so Mochi feels carried up.
  const peakLift = Math.min(100, Math.abs(dy) * 0.35 + 40)

  const translateX = progress.interpolate({
    inputRange: [0, LAND_AT, 1],
    outputRange: [0, dx, dx],
  })
  const translateY = progress.interpolate({
    inputRange: [0, LAND_AT / 2, LAND_AT, 1],
    outputRange: [0, dy / 2 - peakLift, dy, dy],
  })
  const mochiScale = progress.interpolate({
    inputRange: [0, LAND_AT, FADE_START, 1],
    outputRange: [1, 1, 1, 0.7],
  })
  const mochiOpacity = progress.interpolate({
    inputRange: [0, 0.08, FADE_START, 1],
    outputRange: [0, 1, 1, 0],
  })

  return (
    <Animated.View
      style={[
        styles.mochi,
        {
          // Container is MOCHI_SIZE * 1.4 wide × MOCHI_SIZE tall; center on
          // the from-point by half of each dimension.
          left: flight.from.x - (MOCHI_SIZE * 1.4) / 2,
          top: flight.from.y - MOCHI_SIZE / 2,
          opacity: mochiOpacity,
          transform: [{ translateX }, { translateY }, { scale: mochiScale }],
        },
      ]}
    >
      <Image
        source={require('../../assets/mochi-mascot.png')}
        style={styles.mochiImage}
        resizeMode="contain"
      />
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  mochi: {
    position: 'absolute',
    width: MOCHI_SIZE * 1.4,
    height: MOCHI_SIZE,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mochiImage: {
    width: '100%',
    height: '100%',
  },
})
