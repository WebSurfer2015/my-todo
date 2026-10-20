/**
 * Ask Mochi voice input — pure pieces: the status machine, error handling
 * (never raw), and how a transcript joins the typed text.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  classifySpeechError,
  mergeTranscript,
  speechReducer,
  SPEECH_COPY,
  SPEECH_INPUT_MAX,
  type SpeechStatus,
} from '../features/mochi/speechInput'

describe('mergeTranscript', () => {
  it('fills an empty box with the transcript', () => {
    expect(mergeTranscript('', '  buy milk ')).toBe('buy milk')
  })
  it('appends to typed text with one space', () => {
    expect(mergeTranscript('remind me to', 'call mom')).toBe('remind me to call mom')
    expect(mergeTranscript('remind me to  ', 'call mom')).toBe('remind me to call mom')
  })
  it('leaves the base untouched for an empty transcript', () => {
    expect(mergeTranscript('typed ', '   ')).toBe('typed ')
  })
  it('caps at the box maxLength', () => {
    expect(mergeTranscript('a', 'b'.repeat(3000))).toHaveLength(SPEECH_INPUT_MAX)
  })
})

describe('classifySpeechError', () => {
  it('maps codes to calm handling', () => {
    expect(classifySpeechError('not-allowed')).toBe('denied')
    expect(classifySpeechError('language-not-supported')).toBe('unsupported')
    expect(classifySpeechError('service-not-allowed')).toBe('unsupported')
    expect(classifySpeechError('aborted')).toBe('quiet')
    expect(classifySpeechError('no-speech')).toBe('missed')
    expect(classifySpeechError('interrupted')).toBe('missed')
    expect(classifySpeechError(undefined)).toBe('missed')
  })
})

describe('speechReducer', () => {
  const r = speechReducer
  it('unavailable is sticky', () => {
    expect(r('unavailable', { type: 'listen' })).toBe('unavailable')
    expect(r('idle', { type: 'unsupported' })).toBe('unavailable')
  })
  it('listen → ended: heard or quiet → idle; nothing heard → error', () => {
    expect(r('idle', { type: 'listen' })).toBe('listening')
    expect(r('listening', { type: 'ended', heard: true, quiet: false })).toBe('idle')
    expect(r('listening', { type: 'ended', heard: false, quiet: true })).toBe('idle')
    expect(r('listening', { type: 'ended', heard: false, quiet: false })).toBe('error')
  })
  it('ignores a late end when not listening', () => {
    const states: SpeechStatus[] = ['idle', 'denied', 'error']
    for (const s of states) expect(r(s, { type: 'ended', heard: false, quiet: false })).toBe(s)
  })
  it('denied clears on granted; error clears on dismiss', () => {
    expect(r('idle', { type: 'denied' })).toBe('denied')
    expect(r('denied', { type: 'granted' })).toBe('idle')
    expect(r('listening', { type: 'granted' })).toBe('listening')
    expect(r('error', { type: 'dismissError' })).toBe('idle')
    expect(r('idle', { type: 'dismissError' })).toBe('idle')
  })
})

describe('ChatSheet wiring (source guard)', () => {
  const here = dirname(fileURLToPath(import.meta.url))
  const chat = readFileSync(join(here, '..', 'features/mochi/ChatSheet.tsx'), 'utf8')
  const row = /<View style=\{styles\.inputRow\}>[\s\S]*?<\/View>/.exec(chat)?.[0] ?? ''
  it('puts the mic between the text field and Send, hidden when unavailable', () => {
    const field = row.indexOf('<TextInput')
    const mic = row.indexOf('<MicButton')
    const send = row.indexOf('accessibilityLabel="Send"')
    expect(field).toBeGreaterThan(-1)
    expect(mic).toBeGreaterThan(field)
    expect(send).toBeGreaterThan(mic)
    expect(row).toMatch(/speech\.status !== 'unavailable' &&/)
  })
  it('never auto-sends: Send / close / thinking / resting stop listening and discard late results', () => {
    expect(chat).toMatch(/if \(!turn \|\| isThinking\) return\s*\n\s*\/\/[^\n]*\n\s*speech\.stop\(\{ discard: true \}\)/)
    expect(chat).toMatch(/if \(!visible \|\| isThinking \|\| isResting\) stopSpeech\(\{ discard: true \}\)/)
    expect(chat).not.toMatch(/onTranscript:[^\n]*handleSend/)
  })
  it('the denied note links to Settings', () => {
    expect(chat).toMatch(/Linking\.openSettings\(\)/)
  })
})

describe('calm copy', () => {
  it('matches the approved design', () => {
    expect(SPEECH_COPY.denied).toBe('Turn on Microphone and Speech Recognition for Sagely to speak to Mochi.')
    expect(SPEECH_COPY.missed).toBe("Didn't catch that — try again.")
    expect(SPEECH_COPY.micLabel).toBe('Speak instead of typing')
    expect(SPEECH_COPY.stopLabel).toBe('Stop listening')
  })
})
