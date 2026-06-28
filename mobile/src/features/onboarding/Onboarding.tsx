import React, { useMemo, useRef, useState } from 'react'
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  ScrollView,
  NativeSyntheticEvent,
  NativeScrollEvent,
  useWindowDimensions,
  StatusBar,
  Platform,
} from 'react-native'
import Svg, { Ellipse } from 'react-native-svg'
import { useTheme, ThemeColors } from '../../app/theme'

/**
 * Three-screen first-launch flow:
 *   1. Meet Mochi
 *   2. How pebbles work
 *   3. Add your first thing
 *
 * Soft / opt-out: every screen has a "Skip" affordance, the dots are
 * subtle, and the final CTA gives both a primary path (open compose)
 * and a secondary path (just dismiss). No exclamation marks, no
 * "Let's go!", no streak/quota framing.
 *
 * The parent (App.tsx) gates rendering on profile.onboardingDone and
 * marks it true via the onComplete / onSkip callbacks.
 */

interface Props {
  visible: boolean
  onComplete: (intent: 'firstTask' | 'explore') => void
  onSkip: () => void
}

// Subtle 3-stone cairn illustration — same shape as the brand glyph.
// cy values keep the bottom stone (with its stroke) inside the SVG box.
function CairnLarge({ size = 100, fill, stroke }: { size?: number; fill: string; stroke: string }) {
  // Padded SVG box so the bottom stone + its stroke never clip on the
  // floor edge regardless of size or strokeWidth.
  const pad = 4
  const stones = [
    { rx: 0.40, ry: 0.13, cy: 0.22 },
    { rx: 0.50, ry: 0.15, cy: 0.47 },
    { rx: 0.65, ry: 0.17, cy: 0.74 },
  ]
  return (
    <Svg width={size} height={size + pad * 2}>
      {stones.map((s, i) => (
        <Ellipse
          key={i}
          cx={size / 2}
          cy={size * s.cy + pad}
          rx={size * s.rx}
          ry={size * s.ry}
          fill={fill}
          stroke={stroke}
          strokeWidth={2}
        />
      ))}
    </Svg>
  )
}

const SCREENS: Array<{
  visual: 'mochi' | 'cairn' | 'mochi-small'
  title: string
  body: string
}> = [
  {
    visual: 'mochi',
    title: 'Meet Mochi',
    body: "Your gentle planning buddy. Mochi's here to help you finish what matters — at your pace, without pressure.",
  },
  {
    visual: 'cairn',
    title: 'Small wins, real progress',
    body: 'Every task you finish becomes a pebble. They stack up — never reset, never punish. Just a quiet record of what you did today.',
  },
  {
    visual: 'mochi-small',
    title: 'Ready when you are',
    body: "Add one thing. That's it. Mochi's waiting.",
  },
]

export default function Onboarding({ visible, onComplete, onSkip }: Props) {
  const theme = useTheme()
  const { width } = useWindowDimensions()
  const styles = useMemo(() => makeStyles(theme, width), [theme, width])
  const [page, setPage] = useState(0)
  const scrollRef = useRef<ScrollView>(null)

  function goToPage(i: number) {
    setPage(i)
    scrollRef.current?.scrollTo({ x: i * width, animated: true })
  }

  function next() {
    if (page < SCREENS.length - 1) goToPage(page + 1)
  }

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const i = Math.round(e.nativeEvent.contentOffset.x / width)
    if (i !== page) setPage(i)
  }

  const isLast = page === SCREENS.length - 1

  return (
    <Modal visible={visible} animationType="fade" statusBarTranslucent onRequestClose={onSkip}>
      <StatusBar barStyle={theme.statusBar} backgroundColor={theme.bg} />
      <View style={styles.root}>
        {/* Skip button — always available */}
        <View style={styles.topBar}>
          <View style={{ flex: 1 }} />
          <TouchableOpacity
            onPress={onSkip}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Skip onboarding"
          >
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onScroll}
          style={styles.pager}
        >
          {SCREENS.map((s, i) => (
            <View key={i} style={[styles.page, { width }]}>
              <View style={styles.visualWrap}>
                {s.visual === 'mochi' && (
                  <View style={styles.mochiCircleLarge}>
                    <Image
                      source={require('../../../assets/icon.png')}
                      style={styles.mochiImageLarge}
                      resizeMode="cover"
                    />
                  </View>
                )}
                {s.visual === 'cairn' && (
                  <CairnLarge size={140} fill={theme.card} stroke={theme.primary} />
                )}
                {s.visual === 'mochi-small' && (
                  <View style={styles.mochiCircleMed}>
                    <Image
                      source={require('../../../assets/icon.png')}
                      style={styles.mochiImageMed}
                      resizeMode="cover"
                    />
                  </View>
                )}
              </View>
              <Text style={styles.title}>{s.title}</Text>
              <Text style={styles.body}>{s.body}</Text>
            </View>
          ))}
        </ScrollView>

        <View
          style={styles.dots}
          accessible
          accessibilityRole="text"
          accessibilityLabel={`Page ${page + 1} of ${SCREENS.length}`}
        >
          {SCREENS.map((_, i) => (
            <View
              key={i}
              style={[styles.dot, i === page && styles.dotActive]}
            />
          ))}
        </View>

        <View style={styles.actions}>
          {isLast ? (
            <>
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={() => onComplete('firstTask')}
                activeOpacity={0.8}
              >
                <Text style={styles.primaryBtnText}>Add my first thing</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={() => onComplete('explore')}
                activeOpacity={0.7}
              >
                <Text style={styles.secondaryBtnText}>I'll explore first</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity style={styles.primaryBtn} onPress={next} activeOpacity={0.8}>
              <Text style={styles.primaryBtnText}>Next</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  )
}

function makeStyles(c: ThemeColors, _width: number) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: c.bg,
      paddingTop: Platform.OS === 'ios' ? 56 : 40,
      paddingBottom: 32,
    },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      height: 32,
    },
    skipText: {
      fontSize: 15,
      fontWeight: '500',
      color: c.label3,
    },
    pager: {
      flex: 1,
    },
    page: {
      paddingHorizontal: 28,
      alignItems: 'center',
      justifyContent: 'center',
      flex: 1,
    },
    visualWrap: {
      marginBottom: 28,
      alignItems: 'center',
      justifyContent: 'center',
    },
    mochiCircleLarge: {
      width: 180,
      height: 180,
      borderRadius: 90,
      backgroundColor: '#E8F0E5',
      borderWidth: 2,
      borderColor: c.primary,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
    },
    mochiImageLarge: {
      width: 180,
      height: 180,
      borderRadius: 90,
    },
    mochiCircleMed: {
      width: 120,
      height: 120,
      borderRadius: 60,
      backgroundColor: '#E8F0E5',
      borderWidth: 1.5,
      borderColor: c.primary,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
    },
    mochiImageMed: {
      width: 120,
      height: 120,
      borderRadius: 60,
    },
    title: {
      fontSize: 24,
      fontWeight: '700',
      color: c.label,
      textAlign: 'center',
      letterSpacing: -0.4,
      marginBottom: 12,
    },
    body: {
      fontSize: 16,
      color: c.label2,
      textAlign: 'center',
      lineHeight: 23,
      maxWidth: 320,
      fontWeight: '400',
    },
    dots: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 16,
    },
    dot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: c.gray3,
    },
    dotActive: {
      backgroundColor: c.primary,
      width: 18,
    },
    actions: {
      paddingHorizontal: 28,
      gap: 8,
    },
    primaryBtn: {
      height: 50,
      borderRadius: 12,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryBtnText: {
      color: c.primaryOn,
      fontSize: 16,
      fontWeight: '600',
      letterSpacing: -0.16,
    },
    secondaryBtn: {
      height: 44,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondaryBtnText: {
      color: c.label2,
      fontSize: 15,
      fontWeight: '500',
    },
  })
}
