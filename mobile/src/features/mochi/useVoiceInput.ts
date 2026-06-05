import { useCallback, useEffect, useRef, useState } from 'react'
import Voice, {
  type SpeechResultsEvent,
  type SpeechErrorEvent,
} from '@react-native-voice/voice'

/**
 * On-device speech-to-text for the Ask Mochi input. Wraps
 * @react-native-voice/voice: tapping the mic toggles a recognition
 * session; partial + final transcripts stream to `onTranscript`, which
 * the caller writes into the text box (live dictation).
 *
 * NOTE: this is a NATIVE module — it only works in a dev/release build
 * that bundled it (`expo prebuild` + rebuild). It is not available over
 * Metro Fast Refresh in a client that predates the dependency.
 */
export function useVoiceInput(onTranscript: (text: string) => void) {
  const [listening, setListening] = useState(false)
  const onTranscriptRef = useRef(onTranscript)
  onTranscriptRef.current = onTranscript

  useEffect(() => {
    const handleResults = (e: SpeechResultsEvent) => {
      const text = e.value?.[0]
      if (text) onTranscriptRef.current(text)
    }
    Voice.onSpeechResults = handleResults
    Voice.onSpeechPartialResults = handleResults
    Voice.onSpeechEnd = () => setListening(false)
    Voice.onSpeechError = (_e: SpeechErrorEvent) => setListening(false)
    return () => {
      // Tear down listeners + any active session on unmount.
      void Voice.destroy().then(() => Voice.removeAllListeners())
    }
  }, [])

  const toggle = useCallback(async () => {
    try {
      if (listening) {
        await Voice.stop()
        setListening(false)
      } else {
        await Voice.start('en-US')
        setListening(true)
      }
    } catch {
      // Permission denied / recognizer unavailable — fail quietly back
      // to the keyboard; the text box still works.
      setListening(false)
    }
  }, [listening])

  return { listening, toggle }
}
