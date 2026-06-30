/**
 * Completion chime — the soft "task done" sound, played from the row on a
 * completion transition. Lifted out of the old PebbleFlight overlay (now
 * deleted) so the chime survives the move to the in-row CalmFirework
 * celebration; the sound deliberately lives in the row, not in the
 * animation component.
 *
 * One shared player per app lifetime, lazily warmed on first use. Every
 * native call is wrapped in its own try/catch — if the expo-audio native
 * module didn't link into a production build, setAudioModeAsync and
 * createAudioPlayer can throw synchronously (not just reject). A missing
 * chime must never take down the caller; the haptic + visual still fire.
 */
import { createAudioPlayer, setAudioModeAsync, AudioPlayer } from 'expo-audio'

let sharedPlayer: AudioPlayer | null = null
let audioModeReady = false

function ensureSound() {
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

/** Warm the player up ahead of the first completion so it doesn't lag. */
export function primeCompletionChime() {
  try {
    ensureSound()
  } catch {
    // ignore — playback path retries ensureSound() anyway.
  }
}

/** Play the completion chime. Silent no-op if audio isn't available. */
export function playCompletionChime() {
  try {
    ensureSound()
    if (!sharedPlayer) return
    // seekTo(0) so rapid-fire completions each restart from the beginning
    // instead of compounding on the previous play.
    sharedPlayer.seekTo(0)
    sharedPlayer.play()
  } catch {
    // Silent fail — chime is optional, the haptic + visual still fire.
  }
}
