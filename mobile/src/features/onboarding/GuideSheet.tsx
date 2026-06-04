/**
 * Single-guide carousel modal. Pages through one guide's slides;
 * "Done" stamps the guide's id into profile.guidesSeen so the menu
 * shows a check next to it on subsequent visits. Visual language
 * mirrors Onboarding (paging dots, primary CTA) so the surfaces
 * feel like one family.
 */

import React, { useMemo, useRef, useState } from 'react'
import {
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native'
import type { Guide } from './guides'
import { useTheme, ThemeColors } from '../../app/theme'

interface Props {
  visible: boolean
  guide: Guide | null
  /** Called when the user taps Done on the last slide. Also called
   * if they tap the close affordance, so the caller decides whether
   * to record progress. */
  onComplete: () => void
  onClose: () => void
}

export default function GuideSheet({ visible, guide, onComplete, onClose }: Props) {
  const theme = useTheme()
  const { width } = useWindowDimensions()
  const styles = useMemo(() => makeStyles(theme, width), [theme, width])
  const [page, setPage] = useState(0)
  const scrollRef = useRef<ScrollView>(null)

  // Reset to first page whenever the modal opens with a different
  // guide. Without this, re-opening a guide picks up at the last
  // slide the user landed on which feels janky.
  const lastGuideIdRef = useRef<string | null>(null)
  if (guide && guide.id !== lastGuideIdRef.current) {
    lastGuideIdRef.current = guide.id
    if (page !== 0) {
      setPage(0)
      // Defer the scroll to the next frame so the ref is mounted.
      setTimeout(() => scrollRef.current?.scrollTo({ x: 0, animated: false }), 0)
    }
  }

  if (!guide) return null

  function goToPage(i: number) {
    setPage(i)
    scrollRef.current?.scrollTo({ x: i * width, animated: true })
  }

  function next() {
    if (!guide) return
    if (page < guide.slides.length - 1) goToPage(page + 1)
    else onComplete()
  }

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const i = Math.round(e.nativeEvent.contentOffset.x / width)
    if (i !== page) setPage(i)
  }

  const isLast = page === guide.slides.length - 1

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <StatusBar barStyle={theme.statusBar} backgroundColor={theme.bg} />
      <View style={styles.root}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={onClose} hitSlop={10} style={styles.topBtn} accessibilityRole="button" accessibilityLabel="Close guide">
            <Text style={styles.topBtnText}>Close</Text>
          </TouchableOpacity>
          <Text style={styles.topTitle} numberOfLines={1}>{guide.title}</Text>
          <View style={styles.topBtn} />
        </View>

        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onScroll}
          style={styles.pager}
        >
          {guide.slides.map((s, i) => (
            <ScrollView
              key={i}
              style={[styles.page, { width }]}
              contentContainerStyle={styles.pageContent}
              showsVerticalScrollIndicator={false}
            >
              {/* Instruction first, mockup second — the visual is a
                  reinforcement of what the body just said, so we lead
                  with the words and let the diagram anchor it below.
                  Page is wrapped in a ScrollView so tall mockup +
                  long body combinations don't get clipped on shorter
                  screens. */}
              {!s.visual && (() => {
                // Slide-level glyph (emoji) wins when provided —
                // some slides use a specific emoji for thematic
                // moments. Otherwise fall back to the guide's
                // lucide icon in a tinted bubble.
                if (s.glyph) {
                  return <Text style={styles.glyph}>{s.glyph}</Text>
                }
                const Icon = guide.icon
                return (
                  <View style={styles.glyphBubble}>
                    <Icon size={40} color={theme.primary} strokeWidth={1.8} />
                  </View>
                )
              })()}
              <Text style={styles.title}>{s.title}</Text>
              <Text style={styles.body}>{renderBody(s.body, styles)}</Text>
              {s.visual && (
                <View style={styles.visualWrap}>{s.visual}</View>
              )}
            </ScrollView>
          ))}
        </ScrollView>

        <View
          style={styles.dots}
          accessible
          accessibilityRole="text"
          accessibilityLabel={`Slide ${page + 1} of ${guide.slides.length}`}
        >
          {guide.slides.map((_, i) => (
            <View key={i} style={[styles.dot, i === page && styles.dotActive]} />
          ))}
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={next}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={isLast ? 'Done' : 'Next slide'}
          >
            <Text style={styles.primaryBtnText}>{isLast ? 'Got it' : 'Next'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

/**
 * Inline accent styling for example phrases in body text. The
 * guide content uses « » as soft quote marks to delimit examples
 * (e.g. «every Mon and Wed»). Render them in the accent color so
 * the user's eye lands on the concrete pattern.
 */
function renderBody(text: string, styles: ReturnType<typeof makeStyles>): React.ReactNode {
  const parts = text.split(/(«[^»]*»)/g)
  return parts.map((part, i) => {
    if (part.startsWith('«') && part.endsWith('»')) {
      return (
        <Text key={i} style={styles.bodyAccent}>
          {part.slice(1, -1)}
        </Text>
      )
    }
    return <Text key={i}>{part}</Text>
  })
}

function makeStyles(c: ThemeColors, _width: number) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg, paddingTop: 56 },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingBottom: 8,
      gap: 8,
    },
    topBtn: { minWidth: 56 },
    topBtnText: { fontSize: 16, color: c.primary, fontWeight: '600' },
    topTitle: {
      flex: 1,
      fontSize: 17,
      color: c.label,
      fontWeight: '600',
      textAlign: 'center',
    },
    pager: { flex: 1 },
    page: { flex: 1 },
    pageContent: {
      flexGrow: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
      paddingVertical: 16,
    },
    glyph: { fontSize: 64, lineHeight: 72, marginBottom: 24, textAlign: 'center' },
    glyphBubble: {
      width: 88,
      height: 88,
      borderRadius: 22,
      backgroundColor: c.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 24,
    },
    visualWrap: {
      width: '100%',
      maxWidth: 340,
      alignItems: 'center',
      marginTop: 24,
      paddingHorizontal: 4,
    },
    title: {
      fontSize: 26,
      fontWeight: '700',
      color: c.label,
      textAlign: 'center',
      letterSpacing: -0.4,
      marginBottom: 14,
    },
    body: {
      fontSize: 16,
      lineHeight: 23,
      color: c.label2,
      textAlign: 'center',
      maxWidth: 340,
    },
    bodyAccent: { color: c.primary, fontWeight: '600' },
    dots: { flexDirection: 'row', justifyContent: 'center', gap: 7, paddingVertical: 16 },
    dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: c.separator },
    dotActive: { backgroundColor: c.primary, transform: [{ scale: 1.15 }] },
    actions: { paddingHorizontal: 24, paddingBottom: 40 },
    primaryBtn: {
      backgroundColor: c.primary,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
    },
    primaryBtnText: { color: c.primaryOn, fontSize: 17, fontWeight: '600' },
  })
}
