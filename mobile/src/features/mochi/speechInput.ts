/**
 * Pure pieces of Ask Mochi's on-device voice input (`useSpeechInput`): the
 * status machine, how a native error code is treated, and how a transcript
 * joins what the user had already typed. No React / native imports here, so
 * they unit-test in plain node.
 */

/** What the mic control shows.
 * - `unavailable` — no on-device recognizer (or no native module): mic hidden.
 * - `idle` — mic ready.
 * - `listening` — mic is a Stop control; the live transcript fills the box.
 * - `denied` — Microphone / Speech Recognition is off: calm note + Settings link.
 * - `error` — the last try heard nothing: a short "Didn't catch that" line. */
export type SpeechStatus = 'unavailable' | 'idle' | 'listening' | 'denied' | 'error'

export type SpeechEvent =
  /** No on-device recognition (sticky — the mic stays hidden). */
  | { type: 'unsupported' }
  /** Recognition started. */
  | { type: 'listen' }
  /** Permission was refused. */
  | { type: 'denied' }
  /** Permission is now granted (e.g. back from Settings). */
  | { type: 'granted' }
  /** The session ended. `heard` = any words came through; `quiet` = the end
   * was asked for (Stop / Send / close / background), so no "missed" line. */
  | { type: 'ended'; heard: boolean; quiet: boolean }
  /** The "Didn't catch that" line timed out. */
  | { type: 'dismissError' }

export function speechReducer(state: SpeechStatus, event: SpeechEvent): SpeechStatus {
  if (state === 'unavailable') return state
  switch (event.type) {
    case 'unsupported':
      return 'unavailable'
    case 'listen':
      return 'listening'
    case 'denied':
      return 'denied'
    case 'granted':
      return state === 'denied' ? 'idle' : state
    case 'ended':
      if (state !== 'listening') return state
      return event.heard || event.quiet ? 'idle' : 'error'
    case 'dismissError':
      return state === 'error' ? 'idle' : state
  }
}

/** How a native recognition error is handled — never shown raw.
 * - `denied` — permission off → the Settings note.
 * - `unsupported` — no recognizer for en-US on this device → hide the mic
 *   (keyboard dictation still exists).
 * - `quiet` — we aborted it ourselves → just stop.
 * - `missed` — no speech / interrupted / audio hiccup → stop; "Didn't catch
 *   that" if nothing was heard. */
export type SpeechErrorKind = 'denied' | 'unsupported' | 'quiet' | 'missed'

export function classifySpeechError(code: string | undefined): SpeechErrorKind {
  switch (code) {
    case 'not-allowed':
      return 'denied'
    case 'language-not-supported':
    case 'service-not-allowed':
      return 'unsupported'
    case 'aborted':
      return 'quiet'
    default:
      return 'missed'
  }
}

/** The chat box's maxLength — a long dictation never overflows it. */
export const SPEECH_INPUT_MAX = 2000

/** Join a (live) transcript onto what was in the box when listening began:
 * appended with one space; an empty transcript leaves the base untouched. */
export function mergeTranscript(base: string, transcript: string, max = SPEECH_INPUT_MAX): string {
  const heard = transcript.trim()
  if (!heard) return base
  const head = base.replace(/\s+$/, '')
  return (head ? `${head} ${heard}` : heard).slice(0, max)
}

/** Calm copy for the line under the field. */
export const SPEECH_COPY = {
  listening: 'Listening…',
  denied: 'Turn on Microphone and Speech Recognition for Sagely to speak to Mochi.',
  openSettings: 'Open Settings',
  missed: "Didn't catch that — try again.",
  micLabel: 'Speak instead of typing',
  stopLabel: 'Stop listening',
} as const
