/**
 * Home tab — the gentle dashboard. Shows the user's recent rhythm
 * (yesterday / this week / this month done-counts) plus the lifetime
 * pebble cairn as a quiet "look what you've built" reward. Stays calm
 * — no streaks, no comparisons, no graphs.
 *
 * Stats are derived from `todos.completionDate` (set in core's
 * derive when a task moves to Done). Subtasks don't carry per-sub
 * completion dates so they're excluded from the recent buckets;
 * lifetime count still comes from the cumulative `lifetimePebbles`
 * profile counter, which is what the cairn glyph already renders.
 */

import React, { useMemo } from 'react'
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { CheckCircle2 } from 'lucide-react-native'
import { useStore } from '../StoreContext'
import { useLang } from '../LangContext'
import { useTheme, ThemeColors } from '../theme'
import { todayLocal } from '../../../core/src/utils'
import { CairnGlyph } from '../components/PebbleStrip'
import AppHeader from '../components/AppHeader'

function isoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function ago(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return isoDate(d)
}

export default function HomeScreen() {
  const store = useStore()
  const { t } = useLang()
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  const insets = useSafeAreaInsets()

  const counts = useMemo(() => {
    const today = todayLocal()
    const yesterday = ago(1)
    const weekStart = ago(6) // last 7 days inclusive
    const monthStart = ago(29) // last 30 days inclusive
    let dToday = 0
    let dYesterday = 0
    let dWeek = 0
    let dMonth = 0
    for (const t of store.todos) {
      if (!t.done || !t.completionDate) continue
      const cd = t.completionDate
      if (cd === today) dToday += 1
      if (cd === yesterday) dYesterday += 1
      if (cd >= weekStart) dWeek += 1
      if (cd >= monthStart) dMonth += 1
    }
    return { dToday, dYesterday, dWeek, dMonth }
  }, [store.todos])

  return (
    <View style={[styles.flex, { paddingTop: insets.top }]}>
      <AppHeader />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.body, { paddingBottom: 120 }]}
        showsVerticalScrollIndicator={false}
      >
      <View style={styles.statsRow}>
        <StatTile label="Yesterday" value={counts.dYesterday} styles={styles} />
        <StatTile label="This Week" value={counts.dWeek} styles={styles} />
        <StatTile label="This Month" value={counts.dMonth} styles={styles} />
      </View>

      <View style={styles.cairnCard}>
        <View style={styles.cairnGlyph}>
          <CairnGlyph size={52} />
        </View>
        <Text style={styles.cairnValue}>{store.lifetimePebbles}</Text>
        <Text style={styles.cairnLabel}>pebbles placed</Text>
        <Text style={styles.cairnHint}>
          Every task you've finished, since you started.
        </Text>
      </View>

      {counts.dToday > 0 && (
        <Text style={styles.footnote}>
          You've finished {counts.dToday} {counts.dToday === 1 ? 'thing' : 'things'} today.
        </Text>
      )}
      </ScrollView>
    </View>
  )
}

interface StatProps {
  label: string
  value: number
  styles: ReturnType<typeof makeStyles>
}

function StatTile({ label, value, styles }: StatProps) {
  const theme = useTheme()
  return (
    <View style={styles.statTile}>
      <Text style={styles.statValue}>{value}</Text>
      <View style={styles.statLabelRow}>
        <CheckCircle2 size={11} color={theme.primary} strokeWidth={2.4} />
        <Text style={styles.statLabel} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </View>
  )
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1 },
    body: { paddingHorizontal: 20, gap: 18, paddingTop: 4 },
    statsRow: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 4,
    },
    statTile: {
      flex: 1,
      backgroundColor: c.card,
      borderRadius: 14,
      paddingVertical: 18,
      paddingHorizontal: 12,
      alignItems: 'center',
    },
    statValue: {
      fontSize: 28,
      fontWeight: '700',
      color: c.primary,
      fontVariant: ['tabular-nums'],
      letterSpacing: -0.5,
    },
    statLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: 4,
    },
    statLabel: {
      fontSize: 12,
      color: c.label3,
      fontWeight: '600',
      letterSpacing: 0.2,
    },
    cairnCard: {
      backgroundColor: c.primarySoft,
      borderRadius: 18,
      paddingVertical: 28,
      paddingHorizontal: 16,
      alignItems: 'center',
      marginTop: 4,
    },
    cairnGlyph: { marginBottom: 8 },
    cairnValue: {
      fontSize: 40,
      fontWeight: '700',
      color: c.primary,
      lineHeight: 44,
      fontVariant: ['tabular-nums'],
      letterSpacing: -0.6,
    },
    cairnLabel: {
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '600',
      color: c.label2,
      marginTop: 2,
      // Extra bottom padding so the descenders of "pebbles placed"
      // aren't clipped by the Text component's tight bounding box on
      // iOS (a long-standing RN/iOS quirk).
      paddingBottom: 2,
    },
    cairnHint: {
      fontSize: 12,
      lineHeight: 17,
      color: c.label3,
      fontStyle: 'italic',
      textAlign: 'center',
      marginTop: 12,
      maxWidth: 260,
      paddingBottom: 2,
    },
    footnote: {
      fontSize: 13,
      color: c.label2,
      textAlign: 'center',
      marginTop: 8,
    },
  })
}
