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
import { Bell, Calendar, Plus, Repeat, ShoppingBag, Sparkles, Tag } from 'lucide-react-native'
import { useTheme, ThemeColors } from '../../app/theme'

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

interface ChipsProps {
  chips: string[]
  activeIndex?: number
  highlight?: boolean
}

/** Interval-style chip row (None, 15m, 30m, 1h, 2h…). */
export function MockupChips({ chips, activeIndex, highlight }: ChipsProps) {
  const theme = useTheme()
  const s = chipStyles(theme, !!highlight)
  return (
    <View style={s.wrap}>
      <Text style={s.label}>Repeat every</Text>
      <View style={s.row}>
        {chips.map((c, i) => {
          const active = i === activeIndex
          return (
            <View key={i} style={[s.chip, active && s.chipActive]}>
              <Text style={[s.chipText, active && s.chipTextActive]}>{c}</Text>
            </View>
          )
        })}
      </View>
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

/** Wraps any child with a highlight ring + soft glow. Use when a
 * primitive doesn't accept `highlight` (e.g., a whole stack). */
export function MockupHighlight({ children }: { children: React.ReactNode }) {
  const theme = useTheme()
  const s = highlightStyles(theme)
  return <View style={s.wrap}>{children}</View>
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
export function IconPlus() {
  const theme = useTheme()
  return <Plus size={11} color={theme.primary} strokeWidth={2.4} />
}
export function IconStore() {
  const theme = useTheme()
  return <ShoppingBag size={11} color={theme.primary} strokeWidth={2.2} />
}
export function IconSparkles() {
  const theme = useTheme()
  return <Sparkles size={11} color={theme.primary} strokeWidth={2.4} />
}

// ── Styles ─────────────────────────────────────────────────────────────

function sheetStyles(c: ThemeColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: c.bg,
      borderRadius: 14,
      paddingTop: 4,
      paddingBottom: 8,
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
      marginTop: 4,
      marginBottom: 6,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingBottom: 6,
    },
    title: { flex: 1, textAlign: 'center', fontSize: 13, fontWeight: '600', color: c.label },
    titleAccent: { width: 40, textAlign: 'right', fontSize: 12, color: c.primary, fontWeight: '600' },
    body: { paddingHorizontal: 12, gap: 6 },
  })
}

function rowStyles(c: ThemeColors, highlight: boolean) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 8,
      gap: 8,
      backgroundColor: c.card,
      borderRadius: 10,
      borderWidth: highlight ? 2 : StyleSheet.hairlineWidth,
      borderColor: highlight ? c.primary : c.separator,
    },
    icon: { width: 18, alignItems: 'center' },
    iconSpacer: { width: 18 },
    label: { flex: 1, fontSize: 12, color: c.label, fontWeight: '500' },
    value: { fontSize: 12, color: c.label2, maxWidth: 130 },
    valueMuted: { color: c.gray3 },
    chev: { fontSize: 14, color: c.gray3, marginLeft: 2 },
  })
}

function pillsStyles(c: ThemeColors, highlight: boolean) {
  return StyleSheet.create({
    wrap: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 6,
      paddingHorizontal: 6,
      paddingVertical: 6,
      backgroundColor: c.bg,
      borderRadius: 10,
      borderWidth: highlight ? 2 : 0,
      borderColor: highlight ? c.primary : 'transparent',
    },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: c.primarySoft,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    pillText: { fontSize: 11, fontWeight: '600', color: c.primary, letterSpacing: -0.1 },
  })
}

function chipStyles(c: ThemeColors, highlight: boolean) {
  return StyleSheet.create({
    wrap: {
      gap: 6,
      paddingHorizontal: 8,
      paddingVertical: 8,
      borderRadius: 10,
      borderWidth: highlight ? 2 : 0,
      borderColor: highlight ? c.primary : 'transparent',
    },
    label: { fontSize: 11, color: c.label2, fontWeight: '600' },
    row: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
    chip: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: c.primarySoft,
    },
    chipActive: { backgroundColor: c.primary },
    chipText: { fontSize: 11, fontWeight: '600', color: c.primary },
    chipTextActive: { color: c.primaryOn },
  })
}

function todoStyles(c: ThemeColors, highlight: boolean) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 12,
      gap: 8,
      backgroundColor: c.card,
      borderRadius: 10,
      borderWidth: highlight ? 2 : StyleSheet.hairlineWidth,
      borderColor: highlight ? c.primary : c.separator,
    },
    check: {
      width: 18, height: 18, borderRadius: 9,
      borderWidth: 2, borderColor: c.gray3,
      alignItems: 'center', justifyContent: 'center',
    },
    checkDone: { backgroundColor: c.primary, borderColor: c.primary },
    checkMark: { color: c.primaryOn, fontSize: 11, lineHeight: 13, fontWeight: '700' },
    body: { flex: 1, gap: 2 },
    text: { fontSize: 13, color: c.label, fontWeight: '500' },
    textDone: { textDecorationLine: 'line-through', color: c.label3 },
    meta: { fontSize: 11, color: c.label3 },
  })
}

function textFieldStyles(c: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      backgroundColor: c.card,
      borderRadius: 10,
      padding: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.separator,
    },
    text: { fontSize: 13, color: c.label, fontWeight: '500' },
  })
}

function highlightStyles(c: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      borderWidth: 2,
      borderColor: c.primary,
      borderRadius: 12,
      padding: 4,
    },
  })
}
