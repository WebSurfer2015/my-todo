/**
 * Shared screen header rendered at the top of each tab (Home / Todos /
 * Groceries). Avatar on the left opens ProfileSheet, gear on the right
 * opens SettingsSheet — both via the cross-screen SheetContext so they
 * work the same way no matter which tab the user is on.
 *
 * The greeting + identity line come from useStore() so they stay
 * consistent across tabs. Each screen can pass its own `subtitle`
 * override when the identity line doesn't fit (e.g. a static screen
 * title like "Groceries").
 */

import React, { useEffect, useMemo, useRef } from 'react'
import { Animated, Easing, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useIsFocused } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Settings as SettingsIcon, Search as SearchIcon, Filter as FilterIcon } from 'lucide-react-native'
import { collectedGlyphFor } from '../core-bindings/profile'
import { useStore } from './StoreContext'
import { useSheets } from './SheetContext'
import { useLang } from './LangContext'
import { useTheme, ThemeColors } from './theme'
import Avatar from '../ui/Avatar'
import { useRegisterCairn } from '../features/mochi/PebbleFlight'

// Sparse pebble scatter for the header watermark — fixed layout (no
// randomness so it's stable across renders/resume). Small, varied
// ellipses spread across the full band; {l,t}=left/top, {w,h}=size,
// r=tilt, o=opacity. Positioned relative to the visible band (the
// decor layer is offset below the status-bar inset).
const HEADER_PEBBLES = [
  { l: 16, t: 72, w: 34, h: 25, r: '24deg', o: 0.09 },
  { l: 116, t: 20, w: 22, h: 17, r: '140deg', o: 0.06 },
  { l: 208, t: 96, w: 30, h: 22, r: '215deg', o: 0.07 },
  { l: 290, t: 40, w: 37, h: 27, r: '300deg', o: 0.08 },
  { l: 384, t: 64, w: 24, h: 18, r: '75deg', o: 0.06 },
]

interface Props {
  /** Static screen title (Todos / Groceries). When provided, the
   * greeting + identity line are replaced with just this title — the
   * tab IS the context, so the rotating greeting would be noise.
   * Home leaves it undefined to keep the warm greeting + quote. */
  title?: string
  /** When provided, the right-side gear icon is swapped for a
   * search icon and tapping it invokes this callback. Used by Todos
   * + Groceries (settings is reached from the Home tab instead, so
   * we don't lose access entirely). */
  onSearchPress?: () => void
  /** When provided, a filter (funnel) icon renders to the left of the
   * search/gear icon. Used by Todos to surface the Configure /
   * category-picker sheet from the header instead of the in-list
   * FilterBar pill. */
  onFilterPress?: () => void
  /** Tap handler for the gear icon. When omitted, gear isn't rendered
   * — Settings now lives inside ProfileSheet, so a screen that has no
   * tab-specific manage action just shows search (if any) and nothing
   * else on the right. */
  onGearPress?: () => void
}

export default function AppHeader({ title, onSearchPress, onFilterPress, onGearPress }: Props) {
  const store = useStore()
  const sheets = useSheets()
  const { t } = useLang()
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const styles = useMemo(() => makeStyles(theme), [theme])
  // The header watermark uses the avatar's reward icon (cat→fish,
  // dog→bone, rabbit→carrot, …). The turtle/Mochi has no glyph → we
  // fall back to abstract pebbles.
  const rewardGlyph = collectedGlyphFor(store.profile.avatar)

  // Register the avatar's screen position as the "home" target for
  // mark-done celebrations (the flying Mochi glides here). Only the
  // currently-focused tab's AppHeader registers — otherwise tabs
  // would race and the resolver could measure a hidden avatar.
  const avatarRef = useRef<View>(null)
  const registerCairn = useRegisterCairn()
  const isFocused = useIsFocused()
  useEffect(() => {
    if (!isFocused) return
    const resolver = (cb: (p: { x: number; y: number } | null) => void) => {
      const node = avatarRef.current
      if (!node) {
        cb(null)
        return
      }
      node.measureInWindow((x, y, w, h) => {
        if (
          typeof x !== 'number' ||
          typeof y !== 'number' ||
          !(w > 0) ||
          !(h > 0)
        ) {
          cb(null)
          return
        }
        cb({ x: x + w / 2, y: y + h / 2 })
      })
    }
    registerCairn(resolver)
    return () => registerCairn(null)
  }, [registerCairn, isFocused])

  // Mochi happy-dance: scale-pulse + tiny rotation wiggle on every
  // mark-done. Trigger = lifetimePebbles (bumps on each completion).
  // Honors motion preference via store.animationOn — turns off
  // entirely when the user has reduce-motion / no-completion-anim.
  const scale = useRef(new Animated.Value(1)).current
  const rotate = useRef(new Animated.Value(0)).current
  const lifetimeRef = useRef(store.lifetimePebbles)
  useEffect(() => {
    if (lifetimeRef.current === store.lifetimePebbles) return
    const grew = store.lifetimePebbles > lifetimeRef.current
    lifetimeRef.current = store.lifetimePebbles
    if (!grew || !store.animationOn) return
    // Stagger: the lifetimePebbles increment fires AT arrival
    // (PEBBLE_DEFERRAL_MS = same as the flight's DROP_MS), which
    // means chime + sparkles + this wiggle would all hit the same
    // frame. Delay the wiggle by 120ms so the avatar reacts *after*
    // catching the sparkle bloom — reads as cause-and-effect, not
    // simultaneous flash.
    const handle = setTimeout(() => {
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale, { toValue: 1.18, duration: 140, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(scale, { toValue: 0.95, duration: 120, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1.05, duration: 120, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1, duration: 180, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(rotate, { toValue: 1, duration: 110, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(rotate, { toValue: -1, duration: 140, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(rotate, { toValue: 0.4, duration: 120, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(rotate, { toValue: 0, duration: 130, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        ]),
      ]).start()
    }, 120)
    return () => clearTimeout(handle)
  }, [store.lifetimePebbles, store.animationOn, scale, rotate])
  const rotateDeg = rotate.interpolate({
    inputRange: [-1, 1],
    outputRange: ['-9deg', '9deg'],
  })

  return (
    // Extend the header band up through the status-bar inset so the
    // chrome color fills all the way to the top edge (screens no longer
    // pad the top — the header owns that space now).
    <View style={[styles.row, { paddingTop: insets.top + 6 }]}>
      {/* Reward-icon watermark — the avatar's reward (fish/bone/carrot…)
          scattered across the header with random tilts + a 3D shadow;
          the turtle falls back to abstract pebbles. */}
      <View style={styles.decorLayer} pointerEvents="none">
        {HEADER_PEBBLES.map((p, i) =>
          rewardGlyph ? (
            <Text
              key={i}
              style={[
                styles.rewardGlyph,
                {
                  left: p.l,
                  top: p.t,
                  fontSize: p.w + 6,
                  // Much fainter than the abstract pebbles — the reward
                  // emojis are full-color, so keep them as a whisper so
                  // strong ones (carrot, books) don't shout.
                  opacity: Math.min(0.17, p.o * 2.1),
                  transform: [{ rotate: p.r }],
                },
              ]}
            >
              {rewardGlyph}
            </Text>
          ) : (
            <View
              key={i}
              style={[
                styles.pebble,
                {
                  left: p.l,
                  top: p.t,
                  width: p.w,
                  height: p.h,
                  backgroundColor: `rgba(255,255,255,${(p.o * 2).toFixed(3)})`,
                  transform: [{ rotate: p.r }],
                },
              ]}
            />
          ),
        )}
      </View>
      <TouchableOpacity
        style={styles.avatarTouch}
        onPress={sheets.openProfile}
        activeOpacity={0.7}
        accessibilityLabel={t.editProfile}
        accessibilityRole="button"
        testID="avatar-button"
      >
        <Animated.View
          ref={avatarRef}
          style={{ transform: [{ scale }, { rotate: rotateDeg }] }}
        >
          <Avatar avatar={store.profile.avatar} size={54} />
        </Animated.View>
        <View style={styles.textWrap}>
          {title ? (
            <Text style={styles.screenTitle} numberOfLines={1}>
              {title}
            </Text>
          ) : (
            <>
              <Text style={styles.greeting} numberOfLines={1}>
                {store.headerLine}
              </Text>
              {store.identityLine ? (
                <Text
                  style={[
                    styles.identity,
                    store.identityLineIsQuote && styles.identityQuote,
                  ]}
                  numberOfLines={2}
                >
                  {store.identityLine}
                </Text>
              ) : null}
            </>
          )}
        </View>
      </TouchableOpacity>
      {onFilterPress && (
        <TouchableOpacity
          onPress={onFilterPress}
          style={styles.headerRightIcon}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Filter"
          testID="filter-button"
        >
          <FilterIcon size={22} color={theme.primaryOn} strokeWidth={1.8} />
        </TouchableOpacity>
      )}
      {onSearchPress && (
        <TouchableOpacity
          onPress={onSearchPress}
          style={styles.headerRightIcon}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Search"
        >
          <SearchIcon size={22} color={theme.primaryOn} strokeWidth={1.8} />
        </TouchableOpacity>
      )}
      {onGearPress && (
        <TouchableOpacity
          onPress={onGearPress}
          style={styles.gearTouch}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Manage"
          testID="settings-button"
        >
          <SettingsIcon size={22} color={theme.primaryOn} strokeWidth={1.8} />
        </TouchableOpacity>
      )}
    </View>
  )
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingTop: 14,
      paddingBottom: 12,
      // Header band uses the primary (FAB) color; text + icons flip to
      // primaryOn for contrast.
      backgroundColor: c.primary,
      // Clip the decorative pebble watermark to the band.
      overflow: 'hidden',
    },
    // A few big, simple "reward" pebbles tinted very faintly into the
    // header for depth + a calm, sophisticated feel. Decorative only
    // (pointerEvents none); kept sparse so it never reads as busy.
    decorLayer: {
      ...StyleSheet.absoluteFillObject,
    },
    pebble: {
      position: 'absolute',
      borderRadius: 999,
      // Drop shadow gives the faint stones a raised, 3D feel. (Fill
      // color is set inline so the per-pebble alpha doesn't dim the
      // shadow.)
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1.5 },
      shadowOpacity: 0.22,
      shadowRadius: 2,
    },
    rewardGlyph: {
      position: 'absolute',
      // Soft shadow for a little dimensional, "fun" pop on the emoji.
      textShadowColor: 'rgba(0,0,0,0.28)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 1.5,
    },
    avatarTouch: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
    },
    textWrap: { flex: 1, minWidth: 0 },
    screenTitle: {
      fontSize: 27,
      color: c.primaryOn,
      fontWeight: '700',
      letterSpacing: -0.3,
      lineHeight: 31,
    },
    greeting: {
      // Match the Todos/Shopping screen-title font exactly.
      fontSize: 27,
      color: c.primaryOn,
      fontWeight: '700',
      letterSpacing: -0.3,
      lineHeight: 31,
    },
    identity: {
      fontSize: 13,
      color: c.primaryOn,
      opacity: 0.82,
      fontWeight: '500',
      marginTop: 2,
      lineHeight: 18,
    },
    identityQuote: {
      fontStyle: 'italic',
      color: c.primaryOn,
    },
    gearTouch: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: 8,
    },
    headerRightIcon: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: 8,
    },
  })
}
