/**
 * Animation & Sound preferences, lifted out of SettingsSheet so the
 * three toggles (Reduce motion / Completion animation / Completion
 * sound) live in their own focused sheet. Reached from
 * Settings → CONFIGURATION → "Manage Animation & Sound".
 *
 * Live-save model — every toggle calls `onSavePartial` immediately;
 * no Cancel/Save dance.
 */

import React, { useMemo } from 'react'
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { Profile } from '../../core-bindings/profile'
import { useLang } from '../../app/LangContext'
import { useTheme, ThemeColors } from '../../app/theme'

interface Props {
  visible: boolean
  profile: Profile
  onSavePartial: (patch: Partial<Profile>) => void
  onClose: () => void
}

export default function ManageAnimationSoundSheet({
  visible,
  profile,
  onSavePartial,
  onClose,
}: Props) {
  const { t } = useLang()
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])

  const animationOn = profile.completionAnimation !== false
  const soundOn = profile.completionSound !== false
  const reduceMotionOn = profile.reduceMotion === true

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      {/* Sibling backdrop tap-layer (not a wrapper) — a wrapping Pressable
          collapses the sheet into one iOS a11y leaf (breaks VoiceOver/Maestro). */}
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessible={false} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.headerRow}>
            <View style={styles.headerSide} />
            <Text style={styles.title}>Animation &amp; Sound</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10} style={styles.headerSide}>
              <Text style={styles.doneText}>{t.done}</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.card}>
              <ToggleRow
                label="Reduce motion"
                hint="Suppresses Mochi flight, row flash, and the checkbox bounce. Use this if motion makes you queasy."
                value={reduceMotionOn}
                onChange={(v) => onSavePartial({ reduceMotion: v })}
                styles={styles}
              />
              <View style={styles.divider} />
              <ToggleRow
                label="Completion animation"
                hint="A calm scale pulse when you mark a task done."
                value={animationOn && !reduceMotionOn}
                onChange={(v) => onSavePartial({ completionAnimation: v })}
                disabled={reduceMotionOn}
                styles={styles}
              />
              <View style={styles.divider} />
              <ToggleRow
                label="Completion sound"
                hint="A soft chime when you mark a task done."
                value={soundOn}
                onChange={(v) => onSavePartial({ completionSound: v })}
                styles={styles}
              />
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}

interface ToggleRowProps {
  label: string
  hint?: string
  value: boolean
  onChange: (v: boolean) => void
  styles: ReturnType<typeof makeStyles>
  disabled?: boolean
}

function ToggleRow({ label, hint, value, onChange, styles, disabled }: ToggleRowProps) {
  return (
    <TouchableOpacity
      style={[styles.row, disabled && { opacity: 0.4 }]}
      onPress={() => {
        if (!disabled) onChange(!value)
      }}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        {hint && <Text style={styles.rowHint}>{hint}</Text>}
      </View>
      <View style={[styles.toggleTrack, value && styles.toggleTrackOn]}>
        <View style={[styles.toggleKnob, value && styles.toggleKnobOn]} />
      </View>
    </TouchableOpacity>
  )
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: c.modal,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      paddingTop: 12,
      paddingBottom: 24,
      paddingHorizontal: 16,
      maxHeight: '85%',
    },
    handle: {
      alignSelf: 'center',
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.gray3,
      marginBottom: 12,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingBottom: 8,
    },
    headerSide: {
      minWidth: 56,
      alignItems: 'flex-end',
    },
    title: {
      fontSize: 16,
      fontWeight: '700',
      color: c.label,
    },
    doneText: {
      fontSize: 15,
      color: c.blue,
      fontWeight: '600',
    },
    body: { flexGrow: 0 },
    bodyContent: { paddingBottom: 12 },
    card: {
      borderRadius: 12,
      backgroundColor: c.card,
      overflow: 'hidden',
      marginTop: 8,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 14,
    },
    rowLabel: {
      fontSize: 15,
      color: c.label,
      fontWeight: '500',
    },
    rowHint: {
      fontSize: 12,
      color: c.label3,
      marginTop: 2,
      lineHeight: 16,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.separator,
      marginLeft: 14,
    },
    toggleTrack: {
      width: 44,
      height: 26,
      borderRadius: 13,
      backgroundColor: c.gray3,
      justifyContent: 'center',
      padding: 2,
    },
    toggleTrackOn: { backgroundColor: c.primary },
    toggleKnob: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: '#fff',
      alignSelf: 'flex-start',
    },
    toggleKnobOn: { alignSelf: 'flex-end' },
  })
}
