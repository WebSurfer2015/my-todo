/**
 * Picker for `profile.background`. Shows every (pattern × pair) combo as a
 * tile; tap to apply immediately — the change persists through `onChange`
 * (which calls `store.saveProfile` upstream) and re-renders the live
 * `<AppBackground />` underneath the app.
 *
 * Selected tile gets a primary-color ring + checkmark. The default cream
 * solid sits first under the "Solid color" section, so the no-decoration
 * choice is one tap away.
 *
 * Each tile overlays a sample task card so the user can judge content
 * readability against the bg before committing.
 */

import React, { useMemo } from 'react'
import {
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native'
import {
  DEFAULT_BACKGROUND,
  PAIRS,
  PATTERNS,
  tonesFor,
  type Pair,
  type PatternKey,
} from '../backgrounds'
import { renderPattern } from './backgroundPatterns'
import { useTheme, ThemeColors } from '../theme'
import type { BackgroundChoice } from '../profile'

const TILE_W = 168
const TILE_H = 200

interface Props {
  visible: boolean
  value: BackgroundChoice | undefined
  onChange: (next: BackgroundChoice) => void
  onClose: () => void
}

export default function BackgroundPicker({ visible, value, onChange, onClose }: Props) {
  const theme = useTheme()
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light'

  const resolved: BackgroundChoice = value ?? DEFAULT_BACKGROUND

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.root, { backgroundColor: theme.bg }]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.label }]}>Background</Text>
          <TouchableOpacity onPress={onClose} hitSlop={10}>
            <Text style={[styles.close, { color: theme.primary }]}>Done</Text>
          </TouchableOpacity>
        </View>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          {PATTERNS.map((p) => (
            <View key={p.key} style={styles.section}>
              <Text style={[styles.sectionLabel, { color: theme.label2 }]}>
                {p.label}
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.row}
              >
                {PAIRS.map((pair) => {
                  const selected =
                    resolved.pattern === p.key && resolved.pairKey === pair.key
                  return (
                    <Tile
                      key={pair.key}
                      pair={pair}
                      pattern={p.key}
                      scheme={scheme}
                      selected={selected}
                      theme={theme}
                      onPress={() =>
                        onChange({ pattern: p.key, pairKey: pair.key })
                      }
                    />
                  )
                })}
              </ScrollView>
            </View>
          ))}
          <View style={{ height: 32 }} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  )
}

interface TileProps {
  pair: Pair
  pattern: PatternKey
  scheme: 'light' | 'dark'
  selected: boolean
  theme: ThemeColors
  onPress: () => void
}

function Tile({ pair, pattern, scheme, selected, theme, onPress }: TileProps) {
  const tones = useMemo(() => tonesFor(pair, scheme), [pair, scheme])
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${pair.label}${selected ? ', selected' : ''}`}
      style={styles.tileOuter}
    >
      <View
        style={[
          styles.tile,
          selected && {
            borderColor: theme.primary,
            borderWidth: 3,
          },
        ]}
      >
        {renderPattern(pattern, { tones, width: TILE_W, height: TILE_H })}
        <View style={[styles.sampleCard, { backgroundColor: theme.card }]}>
          <View style={[styles.dot, { backgroundColor: theme.primary }]} />
          <View style={{ flex: 1 }}>
            <View style={[styles.barTitle, { backgroundColor: theme.label }]} />
            <View style={[styles.barMeta, { backgroundColor: theme.label3 }]} />
          </View>
        </View>
        {selected && (
          <View style={[styles.check, { backgroundColor: theme.primary }]}>
            <Text style={[styles.checkMark, { color: theme.primaryOn }]}>✓</Text>
          </View>
        )}
      </View>
      <Text
        style={[
          styles.tileLabel,
          { color: selected ? theme.primary : theme.label2 },
          selected && { fontWeight: '700' },
        ]}
        numberOfLines={1}
      >
        {pair.label}
      </Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 4,
    paddingBottom: 12,
  },
  title: { fontSize: 22, fontWeight: '700' },
  close: { fontSize: 17, fontWeight: '600' },
  scroll: { paddingBottom: 24 },
  section: { marginBottom: 22 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: 18,
    marginBottom: 10,
  },
  row: { paddingHorizontal: 14, gap: 12 },
  tileOuter: { width: TILE_W },
  tile: {
    width: TILE_W,
    height: TILE_H,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 0,
  },
  tileLabel: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  sampleCard: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 14,
    padding: 12,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  barTitle: { height: 8, borderRadius: 4, width: '85%', marginBottom: 6, opacity: 0.85 },
  barMeta:  { height: 6, borderRadius: 3, width: '55%', opacity: 0.55 },
  check: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  checkMark: { fontSize: 16, fontWeight: '700', lineHeight: 18 },
})
