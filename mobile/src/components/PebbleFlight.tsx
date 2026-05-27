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
    (from: Point, to: Point, chime: boolean) => {
      const id = nextIdRef.current++
      // FlyingMochi owns the chime when an animation is running so it
      // syncs to landing; suppress it here if chime is opted out.
      setFlights((prev) => [...prev, { id, from, to, chime }])
    },
    [],
  )

  const trigger = useCallback(
    (from: Point, opts?: TriggerOptions) => {
      const wantsAnimate = opts?.animate !== false
      const wantsChime = opts?.chime !== false
      if (!wantsAnimate) {
        if (wantsChime) playChime()
        return
      }
      const resolver = cairnResolverRef.current
      const fallback = fallbackPointRef.current
      if (!resolver) {
        launchFlight(from, fallback, wantsChime)
        return
      }
      resolver((to) => {
        launchFlight(from, to ?? fallback, wantsChime)
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

const MOCHI_SIZE = 56
// Slowed from 1800 → 2400 so the arc reads as "carried", not "flung".
// LAND_AT/DROP_AT keep their relative ratios; the new total gives the
// avatar room to land, do a small two-beat celebration, and fade out
// without feeling rushed.
const FLIGHT_MS = 2400
const LAND_AT = 0.40
const DROP_AT = 0.52
const FADE_START = 0.82
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
  // The cairn-bound animation echoes the user's current avatar
  // when one is set — matches the calm-app touch that chrome
  // reflects identity. Falls back to the brand Mochi turtle
  // (mochi-mascot.png) for users on the default avatar or any
  // path that doesn't yield a preset/image.
  const avatar: Avatar | undefined = useStore().profile.avatar
  const progress = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: FLIGHT_MS,
      // Gentler ease — easeInOutSine-ish — so the arc accelerates and
      // settles softly rather than the previous custom curve which
      // landed with a slight snap. Reads as natural / "carried".
      easing: Easing.bezier(0.45, 0, 0.55, 1),
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
  // Two-beat celebration on landing: a small squash-and-stretch on
  // touchdown, then a softer aftershock, then fade-out shrink. Reads
  // as a happy little arrival rather than a static drop.
  const mochiScale = progress.interpolate({
    inputRange: [
      0,
      LAND_AT,           // arrives at cairn
      LAND_AT + 0.04,    // first bounce up
      LAND_AT + 0.09,    // settles
      LAND_AT + 0.14,    // little second bounce
      LAND_AT + 0.20,    // resting size
      FADE_START,
      1,
    ],
    outputRange: [1, 1, 1.22, 0.95, 1.08, 1, 1, 0.7],
  })
  // Wiggle: a small left-right rotation right after landing reads as
  // "happy dance" before the avatar settles + fades. Disabled before
  // landing (rotation: 0) so the airborne arc doesn't tilt.
  const mochiRotate = progress.interpolate({
    inputRange: [
      0,
      LAND_AT,
      LAND_AT + 0.05,
      LAND_AT + 0.10,
      LAND_AT + 0.15,
      LAND_AT + 0.20,
      1,
    ],
    outputRange: ['0deg', '0deg', '-7deg', '6deg', '-4deg', '0deg', '0deg'],
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
