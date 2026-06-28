/**
 * SheetShell — the one bottom-sheet primitive every sheet sits on, so the
 * structural chrome (Modal, backdrop, handle, header, min-height) is defined
 * ONCE instead of hand-rolled (and drifted) per sheet.
 *
 * It owns the canonical contract from docs/DESIGN.md:
 *  - <Modal transparent animationType="slide"> + onRequestClose
 *  - a11y-SAFE backdrop: a SIBLING Pressable absoluteFill, never a wrapper —
 *    a wrapping Pressable collapses the sheet into one iOS a11y leaf and breaks
 *    VoiceOver / Maestro (RN Modal quirk).
 *  - sheet container: 18-radius top, min 30% / max 85% screen height, safe-area
 *    bottom padding, 36x4 handle.
 *  - header row: Cancel (left) | title (center, 20/700) | primary (right,
 *    primary color). Pass `primary` for the commit action; omit it for
 *    tap-to-select pickers that close themselves.
 *
 * Body content is the children. Two commit models, picked by prop:
 *  - explicit:   primary={{ label: t.save, onPress: save }}
 *  - live-save:  primary={{ label: t.done, onPress: onClose }}
 *  - none:       omit `primary` (pickers).
 *
 * Sub-view sheets (Compose/TaskDetails swap whole pickers in place) just feed
 * dynamic title/left/primary based on their current sub-view.
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
  useWindowDimensions,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLang } from '../app/LangContext'
import { useTheme, ThemeColors } from '../app/theme'

interface HeaderAction {
  label: string
  onPress: () => void
  disabled?: boolean
}

export interface SheetShellProps {
  visible: boolean
  onClose: () => void
  title: string
  /** Optional second line under the title (e.g. a filter name + count). */
  subtitle?: string
  /** Right-side commit action. Omit for tap-to-select pickers. */
  primary?: HeaderAction
  /** Left-side action. Defaults to Cancel → onClose. */
  left?: HeaderAction
  /** Wrap the body in a ScrollView (default). Set false for sheets that own
   * their own scrolling / keyboard layout. */
  scroll?: boolean
  children: React.ReactNode
}

export default function SheetShell({
  visible,
  onClose,
  title,
  subtitle,
  primary,
  left,
  scroll = true,
  children,
}: SheetShellProps) {
  const { t } = useLang()
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  const { height } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const leftAction: HeaderAction = left ?? { label: t.cancel, onPress: onClose }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
      {/* Sibling backdrop tap-layer (not a wrapper) — see header comment. */}
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessible={false} />
        <View
          style={[
            styles.sheet,
            { minHeight: height * 0.3, paddingBottom: Math.max(24, insets.bottom + 8) },
          ]}
        >
          <View style={styles.handle} />
          <View style={styles.headerRow}>
            <TouchableOpacity
              onPress={leftAction.onPress}
              disabled={leftAction.disabled}
              hitSlop={10}
              style={styles.headerSideLeft}
              accessibilityRole="button"
            >
              <Text style={styles.cancelText}>{leftAction.label}</Text>
            </TouchableOpacity>
            <View style={styles.titleCol}>
              <Text style={styles.title} numberOfLines={1}>
                {title}
              </Text>
              {subtitle ? (
                <Text style={styles.subtitle} numberOfLines={1}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
            <View style={styles.headerSideRight}>
              {primary && (
                <TouchableOpacity
                  onPress={primary.onPress}
                  disabled={primary.disabled}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !!primary.disabled }}
                >
                  <Text style={[styles.primaryText, primary.disabled && styles.primaryTextDisabled]}>
                    {primary.label}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {scroll ? (
            <ScrollView
              style={styles.body}
              contentContainerStyle={styles.bodyContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {children}
            </ScrollView>
          ) : (
            <View style={styles.bodyFixed}>{children}</View>
          )}
        </View>
      </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1 },
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
      paddingBottom: 8,
    },
    headerSideLeft: { minWidth: 64, alignItems: 'flex-start' },
    headerSideRight: { minWidth: 64, alignItems: 'flex-end' },
    titleCol: { flex: 1, alignItems: 'center' },
    title: {
      textAlign: 'center',
      fontSize: 20,
      fontWeight: '700',
      color: c.label,
    },
    subtitle: {
      fontSize: 12,
      color: c.label3,
      marginTop: 2,
      textAlign: 'center',
    },
    cancelText: { fontSize: 15, color: c.primary, fontWeight: '500' },
    primaryText: { fontSize: 15, color: c.primary, fontWeight: '600' },
    primaryTextDisabled: { color: c.gray3 },
    body: { flexGrow: 0 },
    bodyContent: { paddingBottom: 12 },
    bodyFixed: { flexShrink: 1 },
  })
}
