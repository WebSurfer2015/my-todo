import React, { useMemo, ReactNode } from 'react'
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native'
import { useTheme, ThemeColors } from '../app/theme'
import CheckGlyph from './CheckGlyph'

interface Option {
  key: string
  label: string
  color?: string
  icon?: ReactNode
}

interface Props {
  title: string
  options: Option[]
  selectedKey: string
  onSelect: (key: string) => void
  /** If provided, renders a ‹ Back button in the header. Omit to hide. */
  onBack?: () => void
}

/**
 * In-sheet picker: replaces the sheet's main content with a back-navigable
 * list of options. Used to avoid stacking modals on top of bottom sheets.
 */
export default function InlinePicker({ title, options, selectedKey, onSelect, onBack }: Props) {
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        {onBack ? (
          <TouchableOpacity onPress={onBack} hitSlop={10} style={styles.backBtn}>
            <Text style={styles.backText}>‹ Back</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.backBtn} />
        )}
        <Text style={styles.title}>{title}</Text>
        <View style={{ width: 64 }} />
      </View>
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        <View style={styles.card}>
          {options.map((opt, i) => (
            <TouchableOpacity
              key={opt.key}
              style={[styles.row, i < options.length - 1 && styles.rowBorder]}
              onPress={() => onSelect(opt.key)}
              activeOpacity={0.6}
            >
              {opt.icon}
              <Text style={[styles.label, { color: opt.color ?? theme.label }]}>
                {opt.label}
              </Text>
              {selectedKey === opt.key && (
                <CheckGlyph size={16} color={opt.color ?? theme.blue} />
              )}
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  )
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    wrap: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 4,
      paddingBottom: 12,
    },
    backBtn: {
      width: 64,
    },
    backText: {
      fontSize: 15,
      fontWeight: '500',
      color: c.blue,
    },
    title: {
      fontSize: 15,
      fontWeight: '700',
      color: c.label,
    },
    list: { flex: 1 },
    listContent: {
      paddingTop: 8,
      paddingBottom: 16,
    },
    card: {
      backgroundColor: c.card,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    rowBorder: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.separator,
    },
    label: {
      flex: 1,
      fontSize: 16,
      fontWeight: '500',
    },
    check: {
      fontSize: 16,
      fontWeight: '700',
    },
  })
}
