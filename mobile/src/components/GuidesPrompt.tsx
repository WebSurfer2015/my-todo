/**
 * Calm first-run prompt offering the new user a few topical
 * walkthroughs. Shown once: AppGate triggers it the first time
 * profile.onboardingDone is true AND profile.guidesPromptShown is
 * not yet set. Both "Show me" and "Maybe later" stamp the flag
 * (we only ask once), so a dismissal won't get pestered.
 *
 * Deliberately minimal — no list of every guide, no checkboxes.
 * The user accepts or defers; the full menu lives behind the
 * "Show me" path or Settings → Tips & guides.
 */

import React, { useMemo } from 'react'
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { Sparkles } from 'lucide-react-native'
import { GUIDES } from '../guides'
import { useTheme, ThemeColors } from '../theme'

interface Props {
  visible: boolean
  /** User wants to see the guide menu. Caller opens it AND stamps
   * profile.guidesPromptShown=true. */
  onAccept: () => void
  /** User dismissed. Caller stamps profile.guidesPromptShown=true. */
  onDismiss: () => void
}

export default function GuidesPrompt({ visible, onAccept, onDismiss }: Props) {
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <Pressable style={styles.fill} onPress={onDismiss} />
        <View style={styles.card}>
          <View style={styles.iconBubble}>
            <Sparkles size={26} color={theme.primary} strokeWidth={2} />
          </View>
          <Text style={styles.title}>A few quick tips?</Text>
          <Text style={styles.body}>
            Sagely has {GUIDES.length} short walkthroughs of its newer features —
            AI suggestions, recurring reminders, smart groceries. Under a minute
            each.{'\n\n'}
            You can find them anytime in Settings → Tips & guides.
          </Text>
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={onDismiss}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Skip the guide tips"
            >
              <Text style={styles.secondaryText}>Maybe later</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={onAccept}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="See the guide tips"
            >
              <Text style={styles.primaryText}>Show me</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 28,
    },
    fill: { ...StyleSheet.absoluteFillObject },
    card: {
      backgroundColor: c.bg,
      borderRadius: 18,
      paddingTop: 28,
      paddingHorizontal: 24,
      paddingBottom: 16,
      alignItems: 'center',
      maxWidth: 360,
    },
    iconBubble: {
      width: 56,
      height: 56,
      borderRadius: 14,
      backgroundColor: c.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
    },
    title: {
      fontSize: 19,
      fontWeight: '700',
      color: c.label,
      textAlign: 'center',
      marginBottom: 10,
    },
    body: {
      fontSize: 14,
      lineHeight: 20,
      color: c.label2,
      textAlign: 'center',
      marginBottom: 18,
    },
    actions: { flexDirection: 'row', gap: 8, alignSelf: 'stretch' },
    secondaryBtn: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 12,
      backgroundColor: c.primarySoft,
      alignItems: 'center',
    },
    secondaryText: { fontSize: 15, fontWeight: '600', color: c.primary },
    primaryBtn: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 12,
      backgroundColor: c.primary,
      alignItems: 'center',
    },
    primaryText: { fontSize: 15, fontWeight: '600', color: c.primaryOn },
  })
}
