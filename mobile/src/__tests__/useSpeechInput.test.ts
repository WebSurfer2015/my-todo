// @vitest-environment happy-dom
/**
 * useSpeechInput: on-device only, permission on first tap, interim results
 * fill the box (appended to typed text), and listening ends on Stop / 10 s
 * of silence / background / unmount without ever sending — never at a mere
 * pause (continuous; a native end inside the window restarts). A missing native
 * module or no on-device recognizer → 'unavailable' (mic hidden).
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { AppState, Platform } from 'react-native'

const fake = vi.hoisted(() => {
  type Cb = (e?: unknown) => void
  const listeners: Record<string, Set<Cb>> = {}
  const mod = {
    supportsOnDeviceRecognition: vi.fn(() => true),
    requestPermissionsAsync: vi.fn(async () => ({ granted: true })),
    getPermissionsAsync: vi.fn(async () => ({ granted: true })),
    start: vi.fn(),
    stop: vi.fn(),
    abort: vi.fn(),
    addListener: vi.fn((event: string, cb: Cb) => {
      ;(listeners[event] ??= new Set()).add(cb)
      return { remove: () => listeners[event]?.delete(cb) }
    }),
  }
  const emit = (event: string, payload?: unknown) => [...(listeners[event] ?? [])].forEach((cb) => cb(payload))
  const reset = () => Object.keys(listeners).forEach((k) => delete listeners[k])
  return { mod, emit, reset, listeners }
})

vi.mock('expo-speech-recognition', () => ({ ExpoSpeechRecognitionModule: fake.mod }))

import * as speechModule from 'expo-speech-recognition'
import {
  useSpeechInput,
  SPEECH_SILENCE_MS,
  SPEECH_ERROR_MS,
  type SpeechModule,
} from '../features/mochi/useSpeechInput'

const load = () => (speechModule as unknown as { ExpoSpeechRecognitionModule: SpeechModule }).ExpoSpeechRecognitionModule
type Emit = { __emit: (s: 'active' | 'background' | 'inactive') => void }
const speak = (transcript: string) => fake.emit('result', { isFinal: false, results: [{ transcript }] })
const final = (transcript: string) => fake.emit('result', { isFinal: true, results: [{ transcript }] })

function setup(opts: { load?: () => SpeechModule | null } = {}) {
  const onTranscript = vi.fn()
  const hook = renderHook(() => useSpeechInput({ onTranscript, load: opts.load ?? load }))
  return { onTranscript, ...hook }
}

describe('useSpeechInput', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    fake.reset()
    Object.values(fake.mod).forEach((f) => (f as { mockClear?: () => void }).mockClear?.())
    fake.mod.supportsOnDeviceRecognition.mockImplementation(() => true)
    fake.mod.requestPermissionsAsync.mockImplementation(async () => ({ granted: true }))
    fake.mod.getPermissionsAsync.mockImplementation(async () => ({ granted: true }))
    Platform.OS = 'ios'
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('is unavailable without the native module, off iOS, or without on-device recognition', () => {
    expect(setup({ load: () => null }).result.current.status).toBe('unavailable')
    expect(setup({ load: () => { throw new Error('no native module') } }).result.current.status).toBe('unavailable')
    fake.mod.supportsOnDeviceRecognition.mockImplementation(() => false)
    expect(setup().result.current.status).toBe('unavailable')
  })

  it('the default loader degrades to unavailable when the module cannot load (vitest / old dev client)', () => {
    Platform.OS = 'android'
    const { result } = renderHook(() => useSpeechInput({ onTranscript: () => {} }))
    expect(result.current.status).toBe('unavailable')
  })

  it('asks permission, starts on-device en-US, and fills the box with interim results', async () => {
    const { result, onTranscript } = setup()
    expect(result.current.status).toBe('idle')
    await act(async () => { await result.current.start('remind me to') })
    expect(fake.mod.requestPermissionsAsync).toHaveBeenCalledTimes(1)
    expect(fake.mod.start).toHaveBeenCalledWith({
      lang: 'en-US',
      interimResults: true,
      continuous: true,
      requiresOnDeviceRecognition: true,
      addsPunctuation: true,
    })
    expect(result.current.status).toBe('listening')
    act(() => speak('call'))
    act(() => speak('call mom'))
    expect(onTranscript).toHaveBeenLastCalledWith('remind me to call mom')
    // A native end is NOT the end: it restarts inside the silence window.
    act(() => fake.emit('end'))
    expect(result.current.status).toBe('listening')
    expect(fake.mod.start).toHaveBeenCalledTimes(2)
  })

  it('permission denied → denied (no start); re-checked on return to the app', async () => {
    fake.mod.requestPermissionsAsync.mockImplementation(async () => ({ granted: false }))
    const { result } = setup()
    await act(async () => { await result.current.start('') })
    expect(result.current.status).toBe('denied')
    expect(fake.mod.start).not.toHaveBeenCalled()
    await act(async () => { (AppState as unknown as Emit).__emit('active') })
    expect(fake.mod.getPermissionsAsync).toHaveBeenCalled()
    expect(result.current.status).toBe('idle')
  })

  it('a not-allowed error mid-session → denied', async () => {
    const { result } = setup()
    await act(async () => { await result.current.start('') })
    act(() => fake.emit('error', { error: 'not-allowed', message: 'raw' }))
    expect(result.current.status).toBe('denied')
  })

  it('unsupported language error hides the mic', async () => {
    const { result } = setup()
    await act(async () => { await result.current.start('') })
    act(() => fake.emit('error', { error: 'language-not-supported' }))
    expect(result.current.status).toBe('unavailable')
  })

  it('stops itself only after 10 s of silence, keeping the text', async () => {
    const { result, onTranscript } = setup()
    await act(async () => { await result.current.start('') })
    act(() => speak('buy eggs'))
    act(() => { vi.advanceTimersByTime(SPEECH_SILENCE_MS - 1) })
    expect(fake.mod.stop).not.toHaveBeenCalled()
    act(() => speak('buy eggs and milk'))
    act(() => { vi.advanceTimersByTime(SPEECH_SILENCE_MS) })
    expect(fake.mod.stop).toHaveBeenCalledTimes(1)
    expect(result.current.status).toBe('idle')
    // The final result after stop still lands.
    act(() => speak('buy eggs and milk.'))
    expect(onTranscript).toHaveBeenLastCalledWith('buy eggs and milk.')
  })

  it('nothing heard → "Didn\'t catch that" (error), which fades on its own', async () => {
    const { result } = setup()
    await act(async () => { await result.current.start('') })
    act(() => { vi.advanceTimersByTime(SPEECH_SILENCE_MS - 1) })
    expect(result.current.status).toBe('listening')
    act(() => { vi.advanceTimersByTime(1) })
    expect(result.current.status).toBe('error')
    act(() => { vi.advanceTimersByTime(SPEECH_ERROR_MS) })
    expect(result.current.status).toBe('idle')
  })

  it('a no-speech / interrupted error with words heard stops quietly', async () => {
    const { result } = setup()
    await act(async () => { await result.current.start('') })
    act(() => speak('hello'))
    act(() => fake.emit('error', { error: 'interrupted' }))
    expect(result.current.status).toBe('idle')
  })

  it('Stop is quiet even with nothing heard; discard ignores late results', async () => {
    const { result, onTranscript } = setup()
    await act(async () => { await result.current.start('') })
    act(() => result.current.stop())
    expect(fake.mod.stop).toHaveBeenCalled()
    expect(result.current.status).toBe('idle')

    await act(async () => { await result.current.start('') })
    act(() => result.current.stop({ discard: true }))
    expect(fake.mod.abort).toHaveBeenCalled()
    onTranscript.mockClear()
    act(() => speak('late words'))
    expect(onTranscript).not.toHaveBeenCalled()
  })

  it('a stop while the permission prompt is up cancels the start', async () => {
    let grant: (v: { granted: boolean }) => void = () => {}
    fake.mod.requestPermissionsAsync.mockImplementation(() => new Promise((res) => { grant = res }))
    const { result } = setup()
    let pending: Promise<void> = Promise.resolve()
    act(() => { pending = result.current.start('') })
    act(() => result.current.stop())
    await act(async () => { grant({ granted: true }); await pending })
    expect(fake.mod.start).not.toHaveBeenCalled()
    expect(result.current.status).toBe('idle')
  })

  it('backgrounding the app stops listening', async () => {
    const { result } = setup()
    await act(async () => { await result.current.start('') })
    act(() => { (AppState as unknown as Emit).__emit('inactive') })
    expect(result.current.status).toBe('listening')
    act(() => { (AppState as unknown as Emit).__emit('background') })
    expect(fake.mod.abort).toHaveBeenCalled()
    expect(result.current.status).toBe('idle')
    act(() => { (AppState as unknown as Emit).__emit('active') })
  })

  it('unmount stops listening and removes listeners', async () => {
    const { result, unmount } = setup()
    await act(async () => { await result.current.start('') })
    unmount()
    expect(fake.mod.abort).toHaveBeenCalled()
    expect(fake.listeners.result?.size ?? 0).toBe(0)
  })

  it('the silence window is 10 s', () => {
    expect(SPEECH_SILENCE_MS).toBe(10_000)
  })

  it('a pause that ends the native session restarts it and keeps the words so far', async () => {
    const { result, onTranscript } = setup()
    await act(async () => { await result.current.start('note:') })
    act(() => speak('buy eggs'))
    act(() => { vi.advanceTimersByTime(4000) })
    // iOS gives up after its own pause (no-speech) — we keep listening.
    act(() => fake.emit('error', { error: 'no-speech' }))
    expect(result.current.status).toBe('listening')
    expect(fake.mod.start).toHaveBeenCalledTimes(2)
    // The new session's transcript starts fresh; the box keeps the old words.
    act(() => speak('and milk'))
    expect(onTranscript).toHaveBeenLastCalledWith('note: buy eggs and milk')
    // And still only 10 s of silence ends it.
    act(() => { vi.advanceTimersByTime(SPEECH_SILENCE_MS - 1) })
    expect(result.current.status).toBe('listening')
    act(() => { vi.advanceTimersByTime(1) })
    expect(result.current.status).toBe('idle')
    // The timer's own stop → native end must NOT restart.
    act(() => fake.emit('end'))
    expect(fake.mod.start).toHaveBeenCalledTimes(2)
  })

  it('final segments are kept whether iOS resets or keeps growing the transcript', async () => {
    const { onTranscript, result } = setup()
    await act(async () => { await result.current.start('') })
    // Growing transcript: the next result repeats the final text first.
    act(() => final('Buy eggs.'))
    act(() => speak('Buy eggs. Call mom'))
    expect(onTranscript).toHaveBeenLastCalledWith('Buy eggs. Call mom')
    // Reset transcript: a fresh segment after a final.
    act(() => final('Buy eggs. Call mom.'))
    act(() => speak('Pay rent'))
    expect(onTranscript).toHaveBeenLastCalledWith('Buy eggs. Call mom. Pay rent')
  })

  it('a recognizer that keeps ending at once stops after a few quiet restarts', async () => {
    const { result } = setup()
    await act(async () => { await result.current.start('') })
    for (let i = 0; i < 3; i++) act(() => fake.emit('end'))
    expect(result.current.status).toBe('listening')
    act(() => fake.emit('end'))
    expect(fake.mod.start).toHaveBeenCalledTimes(4)
    expect(result.current.status).toBe('error')
  })

  it('an interruption (call, Siri) still ends listening', async () => {
    const { result } = setup()
    await act(async () => { await result.current.start('') })
    act(() => fake.emit('error', { error: 'interrupted' }))
    expect(fake.mod.start).toHaveBeenCalledTimes(1)
    expect(result.current.status).toBe('error')
  })

  it('a start that throws natively settles to the "missed" line', async () => {
    fake.mod.start.mockImplementationOnce(() => { throw new Error('busy') })
    const { result } = setup()
    await act(async () => { await result.current.start('') })
    expect(result.current.status).toBe('error')
  })
})
