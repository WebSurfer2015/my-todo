/**
 * On-device voice input for the Ask Mochi chat box.
 *
 * Wraps `expo-speech-recognition` (Apple's SFSpeechRecognizer) with
 * `requiresOnDeviceRecognition: true`, so audio never leaves the iPhone —
 * only the resulting text, and only if the user taps Send. English (en-US),
 * interim results on, non-continuous: listening ends on Stop, after ~2 s of
 * silence, or when the caller stops it (Send, sheet close) / the app
 * backgrounds / the hook unmounts. Nothing is ever sent automatically.
 *
 * The native module is loaded with a guarded require (like adapters/appCheck):
 * a dev client built before the module was added, Android (not shipped; its
 * RECORD_AUDIO is blocked), a device without on-device recognition, and
 * vitest all degrade to `unavailable` — the caller hides the mic.
 */
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { AppState, Platform } from 'react-native'
import { classifySpeechError, mergeTranscript, speechReducer, type SpeechStatus } from './speechInput'

interface Subscription {
  remove(): void
}

/** The slice of `ExpoSpeechRecognitionModule` this hook uses. */
export interface SpeechModule {
  supportsOnDeviceRecognition(): boolean
  requestPermissionsAsync(): Promise<{ granted: boolean }>
  getPermissionsAsync(): Promise<{ granted: boolean }>
  start(options: {
    lang: string
    interimResults: boolean
    continuous: boolean
    requiresOnDeviceRecognition: boolean
    addsPunctuation: boolean
  }): void
  stop(): void
  abort(): void
  addListener(event: 'result', cb: (e: { results?: { transcript?: string }[] }) => void): Subscription
  addListener(event: 'error', cb: (e: { error?: string }) => void): Subscription
  addListener(event: 'end', cb: () => void): Subscription
}

/** Stop after this long with no new words (the native timer is ~3 s). */
export const SPEECH_SILENCE_MS = 2000
/** Give up if no words arrive at all after starting. */
export const SPEECH_NO_SPEECH_MS = 5000
/** How long "Didn't catch that" stays up. */
export const SPEECH_ERROR_MS = 3000

/** Guarded require — null when the native module isn't in this build. */
function loadSpeechModule(): SpeechModule | null {
  if (Platform.OS !== 'ios') return null
  try {
    const mod = require('expo-speech-recognition') as { ExpoSpeechRecognitionModule?: SpeechModule }
    return mod.ExpoSpeechRecognitionModule ?? null
  } catch {
    return null
  }
}

/** The module, but only if it can recognize on the device. */
function resolveOnDevice(load: () => SpeechModule | null): SpeechModule | null {
  try {
    const mod = load()
    return mod && mod.supportsOnDeviceRecognition() ? mod : null
  } catch {
    return null
  }
}

export interface StopOptions {
  /** Ignore any result still in flight (Send / close / background), so a
   * late final result can't refill a box that was just cleared. */
  discard?: boolean
}

export interface SpeechInput {
  status: SpeechStatus
  /** Ask for permission if needed, then listen. `baseText` is what's in the
   * box now — the transcript is appended to it. */
  start: (baseText: string) => Promise<void>
  stop: (opts?: StopOptions) => void
}

export function useSpeechInput({
  onTranscript,
  load = loadSpeechModule,
}: {
  /** Called with the box's new full text on every (interim) result. */
  onTranscript: (text: string) => void
  /** Injectable for tests; the real one is a guarded require. */
  load?: () => SpeechModule | null
}): SpeechInput {
  const [mod] = useState(() => resolveOnDevice(load))
  const [status, dispatch] = useReducer(speechReducer, mod ? 'idle' : 'unavailable')

  const statusRef = useRef(status)
  statusRef.current = status
  const onTranscriptRef = useRef(onTranscript)
  onTranscriptRef.current = onTranscript
  const mountedRef = useRef(true)
  // Bumped by every start / stop, so a start still waiting on the permission
  // prompt is cancelled by a stop, background or unmount meanwhile.
  const sessionRef = useRef(0)
  // Results are applied only while this is true.
  const acceptingRef = useRef(false)
  const baseRef = useRef('')
  const heardRef = useRef(false)
  // The end was asked for (Stop / Send / close) — no "missed" line.
  const quietRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
  }, [])

  const endSession = useCallback(
    (quiet: boolean) => {
      clearTimer()
      dispatch({ type: 'ended', heard: heardRef.current, quiet })
    },
    [clearTimer],
  )

  // Silence: stop the recognizer (its final result still lands) and settle.
  const armTimer = useCallback(
    (ms: number) => {
      clearTimer()
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        try {
          mod?.stop()
        } catch {
          acceptingRef.current = false
        }
        endSession(false)
      }, ms)
    },
    [mod, clearTimer, endSession],
  )

  // Native events, subscribed for the hook's lifetime.
  useEffect(() => {
    if (!mod) return
    const subs: Subscription[] = []
    try {
      subs.push(
        mod.addListener('result', (e) => {
          if (!acceptingRef.current) return
          const transcript = e.results?.[0]?.transcript ?? ''
          if (transcript.trim()) heardRef.current = true
          onTranscriptRef.current(mergeTranscript(baseRef.current, transcript))
          if (statusRef.current === 'listening') armTimer(SPEECH_SILENCE_MS)
        }),
        mod.addListener('error', (e) => {
          const kind = classifySpeechError(e.error)
          if (kind === 'quiet') return
          acceptingRef.current = false
          clearTimer()
          if (kind === 'denied') dispatch({ type: 'denied' })
          else if (kind === 'unsupported') dispatch({ type: 'unsupported' })
          else endSession(quietRef.current)
        }),
        mod.addListener('end', () => {
          acceptingRef.current = false
          endSession(quietRef.current)
        }),
      )
    } catch {
      // A module without an event emitter — nothing to listen to.
    }
    return () => subs.forEach((s) => s.remove())
  }, [mod, armTimer, clearTimer, endSession])

  const start = useCallback(
    async (baseText: string) => {
      if (!mod) return
      if (statusRef.current === 'listening' || statusRef.current === 'unavailable') return
      const session = ++sessionRef.current
      let granted: boolean
      try {
        granted = (await mod.requestPermissionsAsync()).granted
      } catch {
        granted = false
      }
      // Stopped, backgrounded or unmounted while the prompt was up.
      if (session !== sessionRef.current || !mountedRef.current) return
      if (!granted) {
        dispatch({ type: 'denied' })
        return
      }
      baseRef.current = baseText
      heardRef.current = false
      quietRef.current = false
      acceptingRef.current = true
      dispatch({ type: 'listen' })
      statusRef.current = 'listening'
      try {
        mod.start({
          lang: 'en-US',
          interimResults: true,
          continuous: false,
          requiresOnDeviceRecognition: true,
          addsPunctuation: true,
        })
      } catch {
        acceptingRef.current = false
        endSession(false)
        return
      }
      armTimer(SPEECH_NO_SPEECH_MS)
    },
    [mod, armTimer, endSession],
  )

  const stop = useCallback(
    (opts?: StopOptions) => {
      sessionRef.current++
      if (!mod || statusRef.current !== 'listening') return
      quietRef.current = true
      try {
        if (opts?.discard) {
          acceptingRef.current = false
          mod.abort()
        } else {
          mod.stop()
        }
      } catch {
        acceptingRef.current = false
      }
      endSession(true)
      statusRef.current = 'idle'
    },
    [mod, endSession],
  )

  // "Didn't catch that" fades on its own.
  useEffect(() => {
    if (status !== 'error') return
    const id = setTimeout(() => dispatch({ type: 'dismissError' }), SPEECH_ERROR_MS)
    return () => clearTimeout(id)
  }, [status])

  // Background → stop (keep what's in the box). Back to active while denied
  // → re-check, so turning it on in Settings clears the note.
  // ('inactive' is ignored: the permission prompt itself makes the app inactive.)
  useEffect(() => {
    if (!mod) return
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'background') stop({ discard: true })
      else if (next === 'active' && statusRef.current === 'denied') {
        mod
          .getPermissionsAsync()
          .then((p) => {
            if (p.granted && mountedRef.current) dispatch({ type: 'granted' })
          })
          .catch(() => {})
      }
    })
    return () => sub.remove()
  }, [mod, stop])

  // Unmount → stop listening.
  useEffect(() => {
    mountedRef.current = true
    return () => {
      // (A start still waiting on the prompt sees this and bails.)
      mountedRef.current = false
      clearTimer()
      if (statusRef.current === 'listening' || acceptingRef.current) {
        acceptingRef.current = false
        try {
          mod?.abort()
        } catch {
          // Already gone.
        }
      }
    }
  }, [mod, clearTimer])

  return { status, start, stop }
}
