/**
 * Mini UI mockups for guide slides — small fake-UI cards that
 * resemble the surfaces the guide is describing. Each shipped
 * primitive accepts a `highlight` prop that draws a soft tinted
 * ring around the focal element so the user's eye lands on it.
 *
 * Style choices kept loose and stylized on purpose: pixel-perfect
 * mimicry of the real sheets would drift as we evolve the UI.
 * These are wayfinding hints, not screenshots.
 */

import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Bell, Calendar, Repeat, Sparkles, Tag } from 'lucide-react-native'
import { RADIUS, SPACING, TYPE, useTheme, ThemeColors } from '../../app/theme'

interface SheetProps {
  title: string
  children: React.ReactNode
}

/** Faux sheet card with a centered title bar. */
export function MockupSheet({ title, children }: SheetProps) {
  const theme = useTheme()
  const s = sheetStyles(theme)
  return (
    <View style={s.card}>
      <View style={s.handle} />
      <View style={s.titleRow}>
        <View style={{ width: 40 }} />
        <Text style={s.title}>{title}</Text>
        <Text style={s.titleAccent}>Done</Text>
      </View>
      <View style={s.body}>{children}</View>
    </View>
  )
}

interface RowProps {
  icon?: React.ReactNode
  label: string
  value?: string
  highlight?: boolean
  /** Render the value muted (e.g. "None", "Any"). */
  muted?: boolean
}

/** One row inside the field-group card (Category / Due / Priority etc). */
export function MockupRow({ icon, label, value, highlight, muted }: RowProps) {
  const theme = useTheme()
  const s = rowStyles(theme, !!highlight)
  return (
    <View style={s.row}>
      {icon ? <View style={s.icon}>{icon}</View> : <View style={s.iconSpacer} />}
      <Text style={s.label}>{label}</Text>
      <Text style={[s.value, muted && s.valueMuted]} numberOfLines={1}>
        {value ?? ''}
      </Text>
      <Text style={s.chev}>›</Text>
    </View>
  )
}

interface PillsProps {
  pills: Array<{ icon?: React.ReactNode; label: string }>
  highlight?: boolean
}

/** Soft Sparkles-prefixed pill chip row, the AI affordance. */
export function MockupPills({ pills, highlight }: PillsProps) {
  const theme = useTheme()
  const s = pillsStyles(theme, !!highlight)
  return (
    <View style={s.wrap}>
      <Sparkles size={11} color={theme.primary} strokeWidth={2.4} />
      {pills.map((p, i) => (
        <View key={i} style={s.pill}>
          {p.icon}
          <Text style={s.pillText} numberOfLines={1}>
            {p.label}
          </Text>
        </View>
      ))}
    </View>
  )
}

interface TodoProps {
  text: string
  done?: boolean
  meta?: string
  highlight?: boolean
}

/** Single faux todo row — for hidden-gesture / list slides. */
export function MockupTodo({ text, done, meta, highlight }: TodoProps) {
  const theme = useTheme()
  const s = todoStyles(theme, !!highlight)
  return (
    <View style={s.row}>
      <View style={[s.check, done && s.checkDone]}>
        {done && <Text style={s.checkMark}>✓</Text>}
      </View>
      <View style={s.body}>
        <Text style={[s.text, done && s.textDone]} numberOfLines={1}>
          {text}
        </Text>
        {meta && <Text style={s.meta} numberOfLines={1}>{meta}</Text>}
      </View>
    </View>
  )
}

interface TextFieldProps {
  text: string
  placeholder?: string
}

/** Faux multi-line text input — top of compose. */
export function MockupTextField({ text, placeholder }: TextFieldProps) {
  const theme = useTheme()
  const s = textFieldStyles(theme)
  return (
    <View style={s.wrap}>
      <Text style={s.text} numberOfLines={2}>
        {text || placeholder}
      </Text>
    </View>
  )
}

// ── Icon helpers (small lucide wrappers so guides.tsx stays terse)

export function IconCalendar() {
  const theme = useTheme()
  return <Calendar size={14} color={theme.blue} strokeWidth={2} />
}
export function IconTag() {
  const theme = useTheme()
  return <Tag size={14} color={theme.primary} strokeWidth={2} />
}
export function IconBell() {
  const theme = useTheme()
  return <Bell size={14} color={theme.blue} strokeWidth={2} />
}
export function IconRepeat() {
  const theme = useTheme()
  return <Repeat size={14} color={theme.blue} strokeWidth={2} />
}

// ── Styles ─────────────────────────────────────────────────────────────

function sheetStyles(c: ThemeColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: c.bg,
      borderRadius: RADIUS.card,
      paddingTop: SPACING.xs,
      paddingBottom: SPACING.sm,
      paddingHorizontal: 0,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.separator,
      width: '100%',
      maxWidth: 320,
    },
    handle: {
      alignSelf: 'center',
      width: 28,
      height: 3,
      borderRadius: 2,
      backgroundColor: c.gray3,
      opacity: 0.5,
      marginTop: SPACING.xs,
      marginBottom: SPACING.sm,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SPACING.lg,
      paddingBottom: SPACING.sm,
    },
    title: { flex: 1, textAlign: 'center', fontSize: TYPE.footnote, fontWeight: '600', color: c.label },
    titleAccent: { width: 40, textAlign: 'right', fontSize: TYPE.caption, color: c.primary, fontWeight: '600' },
    body: { paddingHorizontal: SPACING.md, gap: SPACING.sm },
  })
}

function rowStyles(c: ThemeColors, highlight: boolean) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      gap: SPACING.sm,
      backgroundColor: c.card,
      borderRadius: RADIUS.control,
      borderWidth: highlight ? 2 : StyleSheet.hairlineWidth,
      borderColor: highlight ? c.primary : c.separator,
    },
    icon: { width: 18, alignItems: 'center' },
    iconSpacer: { width: 18 },
    label: { flex: 1, fontSize: TYPE.caption, color: c.label, fontWeight: '500' },
    value: { fontSize: TYPE.caption, color: c.label2, maxWidth: 130 },
    valueMuted: { color: c.gray3 },
    chev: { fontSize: TYPE.body, color: c.gray3, marginLeft: 2 },
  })
}

function pillsStyles(c: ThemeColors, highlight: boolean) {
  return StyleSheet.create({
    wrap: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: SPACING.sm,
      paddingHorizontal: SPACING.sm,
      paddingVertical: SPACING.sm,
      backgroundColor: c.bg,
      borderRadius: RADIUS.control,
      borderWidth: highlight ? 2 : 0,
      borderColor: highlight ? c.primary : 'transparent',
    },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      backgroundColor: c.primarySoft,
      borderRadius: RADIUS.pill,
      paddingHorizontal: SPACING.sm,
      paddingVertical: 3,
    },
    pillText: { fontSize: TYPE.caption, fontWeight: '600', color: c.primary, letterSpacing: -0.1 },
  })
}

function todoStyles(c: ThemeColors, highlight: boolean) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.md,
      gap: SPACING.sm,
      backgroundColor: c.card,
      borderRadius: RADIUS.control,
      borderWidth: highlight ? 2 : StyleSheet.hairlineWidth,
      borderColor: highlight ? c.primary : c.separator,
    },
    check: {
      width: 18, height: 18, borderRadius: 9,
      borderWidth: 2, borderColor: c.gray3,
      alignItems: 'center', justifyContent: 'center',
    },
    checkDone: { backgroundColor: c.primary, borderColor: c.primary },
    checkMark: { color: c.primaryOn, fontSize: TYPE.caption, lineHeight: 13, fontWeight: '700' },
    body: { flex: 1, gap: 2 },
    text: { fontSize: TYPE.footnote, color: c.label, fontWeight: '500' },
    textDone: { textDecorationLine: 'line-through', color: c.label3 },
    meta: { fontSize: TYPE.caption, color: c.label3 },
  })
}

function textFieldStyles(c: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      backgroundColor: c.card,
      borderRadius: RADIUS.control,
      padding: SPACING.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.separator,
    },
    text: { fontSize: TYPE.footnote, color: c.label, fontWeight: '500' },
  })
}

