/**
 * Menu of all available guides. Lives behind Settings → Tips &
 * guides, and is also the destination when the user accepts the
 * first-run "want a quick tour?" prompt.
 *
 * Each row shows the guide's glyph, title, and a short blurb. A
 * check appears on rows the user has finished (id present in
 * profile.guidesSeen). Tapping a row hands off to GuideSheet via
 * the parent — this component owns no carousel state of its own.
 */

import React, { useMemo } from 'react'
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { Check } from 'lucide-react-native'
import { GUIDES, type Guide } from './guides'
import { RADIUS, SPACING, TYPE, useTheme, ThemeColors } from '../../app/theme'

interface Props {
  visible: boolean
  /** Ids the user has already finished. Renders a check on each. */
  seen: string[]
  onSelect: (guide: Guide) => void
  onClose: () => void
}

export default function GuideMenuSheet({ visible, seen, onSelect, onClose }: Props) {
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  const seenSet = useMemo(() => new Set(seen), [seen])

  return (
    <Modal visible={visible} transparent statusBarTranslucent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Sibling backdrop tap-layer (not a wrapper) — a wrapping Pressable
            collapses the sheet into one iOS a11y leaf (breaks VoiceOver/Maestro). */}
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessible={false} />
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <View style={styles.titleRow}>
              <View style={styles.titleSide} />
              <Text style={styles.title}>Tips & guides</Text>
              <TouchableOpacity onPress={onClose} hitSlop={10} style={styles.titleSide}>
                <Text style={styles.doneText}>Done</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.intro}>
              Short walkthroughs of the things hardest to discover on your own.
              Tap any to read — under a minute each.
            </Text>

            <ScrollView
              contentContainerStyle={styles.scroll}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.card}>
                {GUIDES.map((g, i) => {
                  const Icon = g.icon
                  return (
                    <React.Fragment key={g.id}>
                      {i > 0 && <View style={styles.divider} />}
                      <TouchableOpacity
                        style={styles.row}
                        onPress={() => onSelect(g)}
                        activeOpacity={0.6}
                        accessibilityRole="button"
                        accessibilityLabel={`${g.title}. ${g.blurb}.${seenSet.has(g.id) ? ' Already viewed.' : ''}`}
                      >
                        <View style={styles.iconBubble}>
                          <Icon size={18} color={theme.primary} strokeWidth={2} />
                        </View>
                        <View style={styles.rowMain}>
                          <Text style={styles.rowTitle} numberOfLines={1}>{g.title}</Text>
                          <Text style={styles.rowBlurb} numberOfLines={2}>{g.blurb}</Text>
                        </View>
                        {seenSet.has(g.id) ? (
                          <Check size={18} color={theme.primary} strokeWidth={2.4} />
                        ) : (
                          <Text style={styles.rowChevron}>›</Text>
                        )}
                      </TouchableOpacity>
                    </React.Fragment>
                  )
                })}
              </View>
              <View style={{ height: 24 }} />
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1 },
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: c.bg,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      paddingTop: SPACING.sm,
      paddingBottom: 20,
      maxHeight: '90%',
    },
    handle: {
      alignSelf: 'center',
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.gray3,
      opacity: 0.45,
      marginTop: SPACING.xs,
      marginBottom: SPACING.xs,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.sm,
      paddingBottom: SPACING.xs,
    },
    titleSide: { minWidth: 56, alignItems: 'flex-end' },
    title: { flex: 1, textAlign: 'center', fontSize: TYPE.title, fontWeight: '600', color: c.label },
    doneText: { fontSize: TYPE.bodyLg, color: c.primary, fontWeight: '600' },
    intro: {
      paddingHorizontal: 20,
      paddingBottom: SPACING.md,
      fontSize: TYPE.footnote,
      color: c.label3,
      lineHeight: 18,
    },
    scroll: { paddingHorizontal: SPACING.lg },
    card: { backgroundColor: c.card, borderRadius: RADIUS.card, overflow: 'hidden' },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.md,
      gap: SPACING.md,
      minHeight: 64,
    },
    iconBubble: {
      width: 36,
      height: 36,
      borderRadius: RADIUS.control,
      backgroundColor: c.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowMain: { flex: 1, gap: 2 },
    rowTitle: { fontSize: TYPE.body, color: c.label, fontWeight: '600' },
    rowBlurb: { fontSize: TYPE.footnote, color: c.label3, lineHeight: 17 },
    rowChevron: { fontSize: TYPE.title, color: c.gray3, fontWeight: '300' },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: c.separator, marginLeft: 62 },
  })
}
