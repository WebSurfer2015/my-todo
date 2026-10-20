/**
 * On-device voice input for the Ask Mochi chat box.
 *
 * Wraps `expo-speech-recognition` (Apple's SFSpeechRecognizer) with
 * `requiresOnDeviceRecognition: true`, so audio never leaves the iPhone —
 * only the resulting text, and only if the user taps Send. English (en-US),
 * interim results on, CONTINUOUS: a pause doesn't end it. Listening ends only
 * after SPEECH_SILENCE_MS (5 s) with no new words, on Stop, or when the
 * caller stops it (Send, typing, sheet close) / the app backgrounds / the
 * hook unmounts. If iOS ends its own session sooner (a pause, a no-speech error),
 * the hook quietly restarts it inside that window, keeping the words so far.
 * Nothing is ever sent automatically.
 *
 * The native module is loaded with a guarded require (like adapters/appCheck):
 * a dev client built before the module was added, Android (not shipped; its
 * RECORD_AUDIO is blocked), a device without on-device recognition, and
 * vitest all degrade to `unavailable` — the caller hides the mic.
 */
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { AppState, Platform } from 'react-native'
import {
  classifySpeechError,
  isRestartableSpeechEnd,
  mergeTranscript,
  segmentAfterFinal,
  speechReducer,
  type SpeechStatus,
} from './speechInput'

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
  addListener(
    event: 'result',
    cb: (e: { isFinal?: boolean; results?: { transcript?: string }[] }) => void,
  ): Subscription
  addListener(event: 'error', cb: (e: { error?: string }) => void): Subscription
  addListener(event: 'end', cb: () => void): Subscription
}

/** Stop after this long with no new words — also when none came at all. */
export const SPEECH_SILENCE_MS = 5_000
/** Native restarts allowed in a row with no words between them, so a
 * recognizer that keeps failing at once can't spin until the window ends. */
const MAX_QUIET_RESTARTS = 3

const START_OPTIONS = {
  lang: 'en-US',
  interimResults: true,
  continuous: true,
  requiresOnDeviceRecognition: true,
  addsPunctuation: true,
} as const
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
  /** Ignore any result still in flight (Send / typing / close / background),
   * so a late final result can't refill — or overwrite — the box. Applies
   * even after listening has settled: the recognizer's last result can still
   * be on its way. */
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
  // The box's text so far: what was typed + every finished segment.
  const baseRef = useRef('')
  // The last final transcript (to strip it if iOS keeps growing it) and the
  // live segment's words (kept if the session ends and restarts).
  const lastFinalRef = useRef('')
  const segmentRef = useRef('')
  // We still want to listen (inside the silence window) — a native end then
  // restarts instead of settling.
  const wantRef = useRef(false)
  const restartsRef = useRef(0)
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
      wantRef.current = false
      clearTimer()
      dispatch({ type: 'ended', heard: heardRef.current, quiet })
    },
    [clearTimer],
  )

  // Silence: stop the recognizer (its final result still lands) and settle.
  const armTimer = useCallback(() => {
    clearTimer()
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      wantRef.current = false
      try {
        mod?.stop()
      } catch {
        acceptingRef.current = false
      }
      endSession(false)
    }, SPEECH_SILENCE_MS)
  }, [mod, clearTimer, endSession])

  // iOS ended its session early: keep the words so far and listen again.
  // Returns false when it can't (then the caller settles as before).
  const restart = useCallback((): boolean => {
    if (!mod || !wantRef.current || restartsRef.current >= MAX_QUIET_RESTARTS) return false
    restartsRef.current++
    baseRef.current = mergeTranscript(baseRef.current, segmentRef.current)
    segmentRef.current = ''
    lastFinalRef.current = ''
    try {
      mod.start(START_OPTIONS)
      return true
    } catch {
      return false
    }
  }, [mod])

  // Native events, subscribed for the hook's lifetime.
  useEffect(() => {
    if (!mod) return
    const subs: Subscription[] = []
    try {
      subs.push(
        mod.addListener('result', (e) => {
          if (!acceptingRef.current) return
          const transcript = e.results?.[0]?.transcript ?? ''
          const segment = segmentAfterFinal(lastFinalRef.current, transcript)
          const text = mergeTranscript(baseRef.current, segment)
          if (e.isFinal) {
            baseRef.current = text
            lastFinalRef.current = transcript
            segmentRef.current = ''
          } else {
            segmentRef.current = segment
          }
          onTranscriptRef.current(text)
          if (!transcript.trim()) return
          heardRef.current = true
          restartsRef.current = 0
          // New words → the silence window starts over.
          if (wantRef.current) armTimer()
        }),
        mod.addListener('error', (e) => {
          const kind = classifySpeechError(e.error)
          if (kind === 'quiet') return
          // A pause / no-speech end inside the window → keep listening.
          if (kind === 'missed' && isRestartableSpeechEnd(e.error) && restart()) return
          acceptingRef.current = false
          clearTimer()
          wantRef.current = false
          if (kind === 'denied') dispatch({ type: 'denied' })
          else if (kind === 'unsupported') dispatch({ type: 'unsupported' })
          else endSession(quietRef.current)
        }),
        mod.addListener('end', () => {
          // iOS ended on its own while we still want to listen → restart.
          if (acceptingRef.current && restart()) return
          acceptingRef.current = false
          endSession(quietRef.current)
        }),
      )
    } catch {
      // A module without an event emitter — nothing to listen to.
    }
    return () => subs.forEach((s) => s.remove())
  }, [mod, armTimer, clearTimer, endSession, restart])

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
      lastFinalRef.current = ''
      segmentRef.current = ''
      restartsRef.current = 0
      heardRef.current = false
      quietRef.current = false
      acceptingRef.current = true
      wantRef.current = true
      dispatch({ type: 'listen' })
      statusRef.current = 'listening'
      try {
        mod.start(START_OPTIONS)
      } catch {
        acceptingRef.current = false
        endSession(false)
        return
      }
      armTimer()
    },
    [mod, armTimer, endSession],
  )

  const stop = useCallback(
    (opts?: StopOptions) => {
      sessionRef.current++
      wantRef.current = false
      if (opts?.discard) acceptingRef.current = false
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
      wantRef.current = false
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
