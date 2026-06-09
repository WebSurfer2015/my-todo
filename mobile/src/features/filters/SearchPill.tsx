/**
 * Persistent active-search indicator. Rendered once the SearchTopSheet
 * has been committed (Search action), so the user keeps seeing what
 * is restricting the list below.
 *
 * Tap the pill body  → reopen the topsheet to edit the query.
 * Tap the inline X  → clear the search and remove the pill.
 *
 * Chrome mirrors the filled-primary "active" pill in FilterBar /
 * GroceryView so a search filter reads as just another filter chip.
 */

import React, { useMemo } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Search as SearchIcon, X } from 'lucide-react-native'
import * as Haptics from 'expo-haptics'
import { useTheme, ThemeColors } from '../../app/theme'

interface Props {
  query: string
  onPress: () => void
  onClear: () => void
}

export default function SearchPill({ query, onPress, onClear }: Props) {
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])

  return (
    <TouchableOpacity
      style={styles.pill}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`Search: ${query}. Tap to edit.`}
    >
      <SearchIcon size={12} color={theme.primaryOn} strokeWidth={2.5} />
      <Text style={styles.text} numberOfLines={1}>
        {query}
      </Text>
      <TouchableOpacity
        onPress={() => {
          Haptics.selectionAsync().catch(() => {})
          onClear()
        }}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Clear search"
      >
        <View style={styles.clearGlyph}>
          <X size={10} color={theme.primary} strokeWidth={3} />
        </View>
      </TouchableOpacity>
    </TouchableOpacity>
  )
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingLeft: 10,
      paddingRight: 4,
      paddingVertical: 6,
      borderRadius: 100,
      backgroundColor: c.primary,
    },
    text: {
      fontSize: 13,
      fontWeight: '600',
      letterSpacing: -0.16,
      color: c.primaryOn,
      maxWidth: 160,
    },
    clearGlyph: {
      width: 16,
      height: 16,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.92)',
    },
  })
}
