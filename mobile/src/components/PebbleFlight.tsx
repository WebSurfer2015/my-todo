import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { Animated, Dimensions, Easing, Image, StyleSheet, Text, View } from 'react-native'
import { createAudioPlayer, setAudioModeAsync, AudioPlayer } from 'expo-audio'
import { useStore } from '../StoreContext'
import { findPreset, type Avatar } from '../profile'

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
  /** 'glide' = full Quick Glide Home (spring-in → arc → land at
   *  avatar). 'nod' = lightweight in-place pulse for rapid-fire
   *  completions (2nd+ within the burst window). */
  mode: 'glide' | 'nod'
}

interface TriggerOptions {
  /** Spawn the Mochi flight overlay. Default true. Reduce-motion at the
   * OS level overrides this to false. */
  animate?: boolean
  /** Play the completion chime. Default true. */
  chime?: boolean
}

/**
 * Resolver that, on call, measures the current cairn rect in screen
 * space and returns the next-pebble landing point. Returning null
 * means the cairn isn't measurable right now (sheet closed, hidden,
 * etc.) — the trigger falls back to the seed point.
 */
type CairnResolver = (cb: (p: Point | null) => void) => void

interface Ctx {
  registerCairn: (resolver: CairnResolver | null) => void
  trigger: (from: Point, opts?: TriggerOptions) => void
}

const PebbleFlightCtx = createContext<Ctx | null>(null)

// ── shared sound (preloaded once per provider lifetime) ─────────────────
let sharedPlayer: AudioPlayer | null = null
let audioModeReady = false

function ensureSound() {
  // Wrap each native call in its own try/catch — if the expo-audio
  // native module didn't link into a production build, both
  // setAudioModeAsync and createAudioPlayer can throw synchronously
  // (not just reject a promise). We don't want that to take down the
  // PebbleFlight provider; the animation should still work even with
  // no sound.
  if (!audioModeReady) {
    try {
      setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: false,
        shouldPlayInBackground: false,
        shouldRouteThroughEarpiece: false,
        interruptionMode: 'mixWithOthers',
        interruptionModeAndroid: 'duckOthers',
      }).catch(() => {})
    } catch {
      // native module not linked or runtime mismatch — skip.
    }
    audioModeReady = true
  }
  if (!sharedPlayer) {
    try {
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
  const cairnResolverRef = useRef<CairnResolver | null>(null)
  const fallbackPointRef = useRef<Point>({
    x: Dimensions.get('window').width / 2,
    y: 70,
  })
  const [flights, setFlights] = useState<Flight[]>([])
  const nextIdRef = useRef(0)

  // Warm up the player on mount so the first chime doesn't lag while the
  // WAV decodes.
  useEffect(() => {
    ensureSound()
  }, [])

  const registerCairn = useCallback((resolver: CairnResolver | null) => {
    cairnResolverRef.current = resolver
  }, [])

  const launchFlight = useCallback(
    (from: Point, to: Point, chime: boolean, mode: 'glide' | 'nod') => {
      const id = nextIdRef.current++
      setFlights((prev) => [...prev, { id, from, to, chime, mode }])
    },
    [],
  )

  // Burst detector: completions within BURST_WINDOW_MS count toward
  // a streak. First completion in a streak gets the full glide; 2nd+
  // get the lightweight nod (no cross-screen travel). Resets after
  // the user pauses for the window.
  const burstRef = useRef<{ count: number; lastAt: number }>({ count: 0, lastAt: 0 })

  const trigger = useCallback(
    (from: Point, opts?: TriggerOptions) => {
      const wantsAnimate = opts?.animate !== false
      const wantsChime = opts?.chime !== false
      if (!wantsAnimate) {
        if (wantsChime) playChime()
        return
      }
      // Update burst tracker. Inside the window → increment; outside
      // → reset to 1 (this completion starts a new streak).
      const now = Date.now()
      const within = now - burstRef.current.lastAt < BURST_WINDOW_MS
      burstRef.current.count = within ? burstRef.current.count + 1 : 1
      burstRef.current.lastAt = now
      const mode: 'glide' | 'nod' =
        burstRef.current.count >= BURST_THRESHOLD ? 'nod' : 'glide'

      // Nod mode: no destination needed — fire in place. Tap location
      // is also where the nod plays.
      if (mode === 'nod') {
        launchFlight(from, from, wantsChime, 'nod')
        return
      }
      const resolver = cairnResolverRef.current
      const fallback = fallbackPointRef.current
      if (!resolver) {
        launchFlight(from, fallback, wantsChime, 'glide')
        return
      }
      resolver((to) => {
        launchFlight(from, to ?? fallback, wantsChime, 'glide')
      })
    },
    [launchFlight],
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

// Quick Glide Home: 800ms total. Three beats — spring-in at tap,
// arc-glide to the header avatar, shrink+fade at avatar. Slightly
// larger than the 44pt avatar so the moment registers, but smaller
// than the prior 76pt so it stays discreet during multi-completes.
const MOCHI_SIZE = 52
// 1400ms total — slower than the prior 800ms so each beat reads
// clearly without feeling rushed. Roughly: 280ms spring-in,
// 770ms glide, 350ms arrival shrink.
const FLIGHT_MS = 1400
// Beat boundaries within FLIGHT_MS (as fractions of progress 0→1):
//   SPRING_END   spring-in done
//   ARRIVAL_AT   Mochi at the avatar (chime fires here)
//   FADE_END     fully invisible
const SPRING_END = 0.20
const ARRIVAL_AT = 0.75
const FADE_END = 1.0
const DROP_MS = FLIGHT_MS * ARRIVAL_AT
// Nod fallback for rapid-fire completions (3+ within 2.5s): 800ms
// in-place pulse instead of a full glide. Prevents motion overload
// without losing per-tap feedback.
const NOD_MS = 800
const BURST_WINDOW_MS = 2500
const BURST_THRESHOLD = 2 // 1st within window = full glide; 2nd+ = nod

/**
 * Time (ms) between a completion gesture and Mochi reaching the cairn
 * to drop the pebble. The store imports this and uses it to defer
 * `applyPebbleDelta` so the real pebble materializes on the strip at
 * the exact moment Mochi lands. Keep this exported so a single source
 * controls both the animation timing and the data update timing.
 */
export const PEBBLE_DEFERRAL_MS = DROP_MS

function FlyingMochi({ flight, onDone }: { flight: Flight; onDone: () => void }) {
  // The celebration echoes the user's current avatar when one is
  // set — calm-app touch that chrome reflects identity. Falls back
  // to the brand Mochi turtle (mochi-mascot.png) for the default
  // avatar or any path that doesn't yield a preset/image.
  const avatar: Avatar | undefined = useStore().profile.avatar
  const progress = useRef(new Animated.Value(0)).current
  const isNod = flight.mode === 'nod'

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: isNod ? NOD_MS : FLIGHT_MS,
      // Glide uses the Material standard fast-out-slow-in bezier
      // — accelerates out, settles softly at the avatar. Nod uses
      // a simple ease for the in-place pulse.
      easing: isNod ? Easing.inOut(Easing.quad) : Easing.bezier(0.25, 0.1, 0.25, 1),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onDone()
    })
    // Chime fires at arrival (glide) or at the nod peak (nod). Both
    // sync the audio to the visual peak rather than the start/end.
    const delay = isNod ? NOD_MS * 0.4 : DROP_MS
    const t = flight.chime ? setTimeout(playChime, delay) : null
    return () => { if (t) clearTimeout(t) }
  }, [progress, onDone, flight.chime, isNod])

  // ── NOD branch ──────────────────────────────────────────────────────
  // 500ms in-place pulse for rapid-fire completions. No travel —
  // just a quick fade-in + scale bump + fade-out at the tap point.
  if (isNod) {
    const nodScale = progress.interpolate({
      inputRange: [0, 0.4, 1],
      outputRange: [0.8, 1.12, 1.0],
    })
    const nodOpacity = progress.interpolate({
      inputRange: [0, 0.2, 0.7, 1],
      outputRange: [0, 1, 1, 0],
    })
    return (
      <Animated.View
        style={[
          styles.mochi,
          {
            left: flight.from.x - MOCHI_SIZE / 2,
            top: flight.from.y - MOCHI_SIZE / 2,
            opacity: nodOpacity,
            transform: [{ scale: nodScale }],
          },
        ]}
      >
        {renderAvatarGlyph(avatar)}
      </Animated.View>
    )
  }

  // ── GLIDE branch ────────────────────────────────────────────────────
  // Three beats — spring-in (0 → SPRING_END), arc-glide (SPRING_END
  // → ARRIVAL_AT), shrink-fade at avatar (ARRIVAL_AT → 1).
  const dx = flight.to.x - flight.from.x
  const dy = flight.to.y - flight.from.y
  // Arc apex: lift halfway between for a gentle parabola. Doesn't
  // dwarf the tap-to-avatar straight line — keeps the path
  // recognizable as "purposeful delivery."
  const arcLift = Math.min(40, Math.abs(dy) * 0.18 + 20)

  // X: hold at 0 during spring-in, glide to dx by arrival, hold
  // during the shrink-fade.
  const translateX = progress.interpolate({
    inputRange: [0, SPRING_END, ARRIVAL_AT, 1],
    outputRange: [0, 0, dx, dx],
  })
  // Y: hold at 0 during spring-in, arc up-then-down to dy by
  // arrival, hold during shrink-fade.
  const arcMid = SPRING_END + (ARRIVAL_AT - SPRING_END) / 2
  const translateY = progress.interpolate({
    inputRange: [0, SPRING_END, arcMid, ARRIVAL_AT, 1],
    outputRange: [0, 0, dy / 2 - arcLift, dy, dy],
  })
  // Scale: spring-in (0.7 → 1.08 → 1.0), subtle breath during glide
  // (1.0 ↔ 0.94 ↔ 1.0), shrink at arrival (1.0 → 0.2).
  const breathMid = SPRING_END + (ARRIVAL_AT - SPRING_END) / 2
  const mochiScale = progress.interpolate({
    inputRange: [
      0,
      SPRING_END * 0.6,  // peak of spring-in
      SPRING_END,        // spring-in settled
      breathMid,         // breath low point
      ARRIVAL_AT,        // at avatar
      FADE_END,          // shrunk to dot
    ],
    outputRange: [0.7, 1.08, 1.0, 0.94, 1.0, 0.2],
  })
  // Opacity: fade in over spring, full through glide, fade out at
  // arrival.
  const mochiOpacity = progress.interpolate({
    inputRange: [0, SPRING_END * 0.5, ARRIVAL_AT, FADE_END],
    outputRange: [0, 1, 1, 0],
  })
  // Tilt: lean into the glide direction (toward avatar). Static
  // during spring-in and shrink-fade.
  const tiltDeg = dx === 0 ? 0 : dx > 0 ? 8 : -8
  const mochiRotate = progress.interpolate({
    inputRange: [0, SPRING_END, ARRIVAL_AT, FADE_END],
    outputRange: ['0deg', `${tiltDeg}deg`, '0deg', '0deg'],
  })

  return (
    <Animated.View
      style={[
        styles.mochi,
        {
          left: flight.from.x - MOCHI_SIZE / 2,
          top: flight.from.y - MOCHI_SIZE / 2,
          opacity: mochiOpacity,
          transform: [
            { translateX },
            { translateY },
            { rotate: mochiRotate },
            { scale: mochiScale },
          ],
        },
      ]}
    >
      {renderAvatarGlyph(avatar)}
    </Animated.View>
  )
}

/**
 * Bundled image assets for presets that ship with their own PNG.
 * Keep in sync with PRESET_IMAGES in components/Avatar.tsx — when
 * art is added there it should be added here too so the flight uses
 * the same illustration users see on the avatar tile.
 */
const FLIGHT_PRESET_IMAGES: Record<string, ReturnType<typeof require>> = {
  mochi: require('../../assets/mochi-mascot.png'),
  // cat:       require('../../assets/preset-avatars/cat.png'),
  // dog:       require('../../assets/preset-avatars/dog.png'),
  // bird:      require('../../assets/preset-avatars/bird.png'),
  // fish:      require('../../assets/preset-avatars/fish.png'),
  // flower:    require('../../assets/preset-avatars/flower.png'),
  // butterfly: require('../../assets/preset-avatars/butterfly.png'),
  // owl:       require('../../assets/preset-avatars/owl.png'),
  // elephant:  require('../../assets/preset-avatars/elephant.png'),
  // whale:     require('../../assets/preset-avatars/whale.png'),
  // squirrel:  require('../../assets/preset-avatars/squirrel.png'),
  // rabbit:    require('../../assets/preset-avatars/rabbit.png'),
}

/**
 * Render the airborne glyph based on the user's current avatar.
 * Preset with a bundled PNG (e.g. mochi) → the bundled illustration,
 * so the brand mascot flies as itself instead of the small fallback
 * emoji. Preset without art → emoji. Image (user upload) → photo.
 * Anything else (icon avatar, missing) → the brand Mochi turtle.
 */
function renderAvatarGlyph(avatar: Avatar | undefined): React.ReactNode {
  if (avatar?.kind === 'preset') {
    const preset = findPreset(avatar.key)
    const bundled = preset.imageKey ? FLIGHT_PRESET_IMAGES[preset.imageKey] : undefined
    if (bundled) {
      return (
        <Image
          source={bundled}
          style={styles.mochiImage}
          resizeMode="contain"
        />
      )
    }
    // No tinted bg circle during flight — the emoji rides on its
    // own so the motion reads as "the thing itself" not "the thing
    // in a sticker". The avatar tile (with bg) stays as-is in
    // ProfileHeader.
    return (
      <View style={styles.avatarCircle}>
        <Text style={styles.avatarEmoji}>{preset.emoji}</Text>
      </View>
    )
  }
  if (avatar?.kind === 'image' && avatar.uri) {
    return (
      <Image
        source={{ uri: avatar.uri }}
        style={styles.avatarPhoto}
        resizeMode="cover"
      />
    )
  }
  return (
    <Image
      source={require('../../assets/mochi-mascot.png')}
      style={styles.mochiImage}
      resizeMode="contain"
    />
  )
}

const styles = StyleSheet.create({
  mochi: {
    position: 'absolute',
    width: MOCHI_SIZE,
    height: MOCHI_SIZE,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mochiImage: {
    width: '100%',
    height: '100%',
  },
  avatarCircle: {
    width: MOCHI_SIZE,
    height: MOCHI_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  avatarEmoji: {
    fontSize: MOCHI_SIZE * 0.6,
    lineHeight: MOCHI_SIZE * 0.7,
    textAlign: 'center',
  },
  avatarPhoto: {
    width: MOCHI_SIZE,
    height: MOCHI_SIZE,
    borderRadius: MOCHI_SIZE / 2,
  },
})
