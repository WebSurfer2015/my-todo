import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { RADIUS, SPACING, TYPE, useTheme, ThemeColors } from '../../app/theme'
import { PRIVACY_URL } from '../../app/links'
import * as Haptics from 'expo-haptics'
import { useModalPresence } from '../../app/modalPresence'
import { useSpeechInput } from '../mochi/useSpeechInput'
import { MicButton, SpeechStatusNote } from '../mochi/VoiceInput'
import { MOCHI_EXAMPLES } from '../mochi/examplePrompts'

/**
 * One-screen first launch: Mochi is the front door (Phase 2, 2026-10-18).
 *
 *   Hi, I'm Mochi.
 *   Tell me one thing that's on your mind…
 *   [ e.g. call the dentist on Friday  (🎤) (↑) ]
 *   (Call someone) (Pay a bill) (Pick something up)
 *   I'll look around first
 *   Mochi sends what you type to our AI provider… Privacy
 *
 * Sending hands the words to Mochi (the parent opens the chat and sends
 * them), so the first thing a person sees is their own to-do. The mic is
 * Ask Mochi's (on-device, fills the box, never auto-sends). No slides,
 * no streak/quota framing, no exclamation marks. The AI disclosure is
 * shown BEFORE anything is sent (App Review 5.1.2(i)).
 *
 * The parent (App.tsx) gates rendering on profile.onboardingDone and marks
 * it true via onSubmit / onExplore.
 */

interface Props {
  visible: boolean
  /** The user's first thing, trimmed and non-empty. */
  onSubmit: (text: string) => void
  /** "I'll look around first" (also Android back). */
  onExplore: () => void
}


export default function Onboarding({ visible, onSubmit, onExplore }: Props) {
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  const [text, setText] = useState('')
  const inputRef = useRef<TextInput>(null)
  const canSend = text.trim().length > 0
  // A reminder tap must not try to present details over onboarding.
  useModalPresence(visible)
  const speech = useSpeechInput({ onTranscript: setText })

  useEffect(() => {
    if (visible) setText('')
  }, [visible])
  // Leaving the screen ends listening; a late result must not refill it.
  const stopSpeech = speech.stop
  useEffect(() => {
    if (!visible) stopSpeech({ discard: true })
  }, [visible, stopSpeech])

  function toggleSpeech() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
    if (speech.status === 'listening') speech.stop()
    else void speech.start(text)
  }

  function send() {
    const trimmed = text.trim()
    if (!trimmed) return
    // Send ends listening; a late result must not refill the box.
    speech.stop({ discard: true })
    onSubmit(trimmed)
  }

  return (
    <Modal visible={visible} animationType="fade" statusBarTranslucent onRequestClose={onExplore}>
      <StatusBar barStyle={theme.statusBar} />
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.hero}>
            <View style={styles.mochiCircle}>
              <Image
                source={require('../../../assets/icon.png')}
                style={styles.mochiImage}
                resizeMode="cover"
                accessibilityIgnoresInvertColors
              />
            </View>
            <Text style={styles.title} accessibilityRole="header">Hi, I'm Mochi.</Text>
            <Text style={styles.body}>
              Tell me one thing that's on your mind. I'll turn it into a to-do — you can change
              anything after.
            </Text>
          </View>

          <Text style={styles.inputLabel}>One thing on your mind</Text>
          {/* Voice status sits ABOVE the field: below it, the keyboard
              covers it. */}
          <SpeechStatusNote status={speech.status} />
          <View style={styles.inputCard}>
            <TextInput
              ref={inputRef}
              style={styles.input}
              value={text}
              onChangeText={(next) => {
                // Typing takes over from the mic: a later speech result
                // would rebuild the box and drop this edit.
                speech.stop({ discard: true })
                setText(next)
              }}
              placeholder="e.g. call the dentist on Friday"
              placeholderTextColor={theme.label2}
              multiline
              maxLength={2000}
              returnKeyType="send"
              blurOnSubmit
              onSubmitEditing={send}
              accessibilityLabel="One thing on your mind"
            />
            {speech.status !== 'unavailable' && (
              <MicButton listening={speech.status === 'listening'} onPress={toggleSpeech} />
            )}
            <TouchableOpacity
              style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
              onPress={send}
              disabled={!canSend}
              accessibilityRole="button"
              accessibilityLabel="Send to Mochi"
              accessibilityState={{ disabled: !canSend }}
            >
              <Text style={styles.sendBtnText}>↑</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.chips}>
            {MOCHI_EXAMPLES.map((ex) => (
              <TouchableOpacity
                key={ex}
                style={styles.chip}
                onPress={() => {
                  // A starter, not a submission — the user finishes the thought.
                  speech.stop({ discard: true })
                  setText(`${ex} `)
                  inputRef.current?.focus()
                }}
                accessibilityRole="button"
              >
                <Text style={styles.chipText}>{ex}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.spacer} />

          <TouchableOpacity
            style={styles.exploreBtn}
            onPress={onExplore}
            accessibilityRole="button"
          >
            <Text style={styles.exploreText}>I'll look around first</Text>
          </TouchableOpacity>
          <Text style={styles.disclosure}>
            Mochi sends what you type, plus your to-do and shopping lists, to Anthropic (Claude) to understand it — never for ads or training.{' '}
            <Text
              style={styles.link}
              onPress={() => Linking.openURL(PRIVACY_URL).catch(() => {})}
              accessibilityRole="link"
            >
              Privacy
            </Text>
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  )
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    content: {
      flexGrow: 1,
      paddingHorizontal: SPACING.xl,
      paddingTop: Platform.OS === 'ios' ? 96 : 64,
      paddingBottom: SPACING.xxl,
    },
    hero: { alignItems: 'center', gap: SPACING.lg, marginBottom: SPACING.xxl },
    mochiCircle: {
      width: 96,
      height: 96,
      borderRadius: 48,
      overflow: 'hidden',
      backgroundColor: c.primarySoft,
    },
    mochiImage: { width: 96, height: 96 },
    title: { fontSize: 28, lineHeight: 34, fontWeight: '700', color: c.label, textAlign: 'center' },
    body: {
      fontSize: TYPE.bodyLg,
      lineHeight: 24,
      color: c.label2,
      textAlign: 'center',
      maxWidth: 320,
    },
    inputLabel: {
      fontSize: TYPE.footnote,
      fontWeight: '600',
      color: c.label2,
      marginBottom: SPACING.sm,
    },
    inputCard: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: SPACING.sm,
      backgroundColor: c.card,
      borderRadius: RADIUS.card,
      borderWidth: 1,
      borderColor: c.border,
      paddingLeft: SPACING.md,
      paddingRight: SPACING.sm,
      paddingVertical: SPACING.sm,
    },
    input: {
      flex: 1,
      minHeight: 72,
      fontSize: TYPE.bodyLg,
      lineHeight: 24,
      color: c.label,
      paddingTop: SPACING.xs,
      textAlignVertical: 'top',
    },
    sendBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sendBtnDisabled: { opacity: 0.4 },
    sendBtnText: { fontSize: 20, fontWeight: '700', color: c.primaryOn },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.md },
    chip: {
      minHeight: 44,
      paddingHorizontal: SPACING.lg,
      borderRadius: RADIUS.pill,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.card,
      justifyContent: 'center',
    },
    chipText: { fontSize: TYPE.body, color: c.label },
    spacer: { flexGrow: 1, minHeight: SPACING.xxl },
    exploreBtn: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: SPACING.lg },
    exploreText: { fontSize: TYPE.bodyLg, fontWeight: '600', color: c.primary },
    disclosure: {
      marginTop: SPACING.md,
      fontSize: TYPE.footnote,
      lineHeight: 18,
      color: c.label2,
      textAlign: 'center',
    },
    link: { color: c.primary, fontWeight: '600', textDecorationLine: 'underline' },
  })
}
