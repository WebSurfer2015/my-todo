/**
 * In-app guide catalog — short topical walkthroughs the user can
 * play from Settings → Tips & guides, or accept from the first-run
 * "want a quick tour?" prompt right after onboarding (also fires
 * for upgraders whose profile predates guidesPromptShown).
 *
 * Each guide is a small carousel (3–5 slides). Slides pair a
 * compact in-code mockup of the relevant surface (with a soft
 * highlight ring on the focal element) with a short body. We
 * deliberately don't ship pixel-perfect screenshots — these are
 * wayfinding hints, not docs.
 *
 * Guide ids are durable strings — the user's `profile.guidesSeen`
 * is keyed off them. Renaming an id silently un-marks any user
 * who already finished that guide.
 */

import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import {
  Bell as BellMenuIcon,
  Hand as HandIcon,
  ListChecks,
  Palette,
  ShoppingBag as ShoppingBagMenuIcon,
  Sparkles as SparklesMenuIcon,
  type LucideIcon,
} from 'lucide-react-native'
import {
  MockupChips,
  MockupHighlight,
  MockupPills,
  MockupRow,
  MockupSheet,
  MockupTextField,
  MockupTodo,
  IconBell,
  IconCalendar,
  IconPlus,
  IconRepeat,
  IconStore,
  IconTag,
} from './components/GuideMockups'

export interface GuideSlide {
  /** Display title for the slide. */
  title: string
  /** Body text. May contain examples between « » to render in the
   * theme's accent color (the GuideSheet renderer colors those). */
  body: string
  /** Compact mockup of the relevant surface, rendered above the
   * title. Highlight the focal element so the user's eye lands on
   * what the slide is teaching. Optional — text-only slides skip it. */
  visual?: React.ReactNode
  /** Fallback emoji when no visual is provided. Ignored when
   * `visual` is set. */
  glyph?: string
}

export interface Guide {
  id: string
  /** Short one-line title shown in the menu list. */
  title: string
  /** Tag line below the title in the menu. Keep under ~70 chars. */
  blurb: string
  /** Lucide icon for the menu row + the prompt + the fallback for
   * slides without a visual. Sleeker than emoji on the menu and
   * matches the rest of the app's iconography. */
  icon: LucideIcon
  /** Legacy emoji glyph — still used for backward-compat in places
   * where rendering a React icon would be awkward (none currently). */
  glyph: string
  slides: GuideSlide[]
}

// inlineStyles must be declared before GUIDES so the slide visuals
// can reference it during module evaluation (`const` block-scoped
// references are flagged by TS even though JS hoisting would let
// it work at runtime).
const inlineStyles = StyleSheet.create({
  stack: { width: '100%', maxWidth: 320 },

  subsHeader: { paddingHorizontal: 10, paddingTop: 4 },
  subsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  subsHeaderText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8E8E93',
    letterSpacing: 0.6,
  },
  clearAllChip: {
    backgroundColor: 'rgba(79,138,117,0.18)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  clearAllText: { fontSize: 11, fontWeight: '600', color: '#4F8A75' },
  addStepRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(79,138,117,0.10)',
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#4F8A75',
    borderStyle: 'dashed',
  },
  addStepText: { fontSize: 12, fontWeight: '600', color: '#4F8A75' },

  oftenWrap: { gap: 6, alignSelf: 'stretch', paddingHorizontal: 8 },
  oftenLabel: {
    fontSize: 11,
    color: '#8E8E93',
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  oftenRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  oftenChip: {
    backgroundColor: 'rgba(79,138,117,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  oftenChipText: { fontSize: 12, color: '#4F8A75', fontWeight: '600' },

  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.04)',
    borderRadius: 10,
    width: '100%',
    maxWidth: 320,
  },
  headerBarTitle: { flex: 1, fontSize: 14, fontWeight: '600' },
  headerBarRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerBarChip: {
    backgroundColor: 'rgba(79,138,117,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  headerBarChipText: { fontSize: 11, fontWeight: '600', color: '#4F8A75' },
  headerBarIcon: {
    width: 30,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },
  headerBarIconHighlight: { borderWidth: 2, borderColor: '#4F8A75' },
  headerBarIconGlyph: { fontSize: 18, fontWeight: '700' },

  swipeWrap: {
    width: '100%',
    maxWidth: 320,
    flexDirection: 'row',
    overflow: 'hidden',
    borderRadius: 10,
  },
  swipeRow: { flex: 1 },
  swipeAction: {
    width: 70,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E07878',
  },
  swipeActionText: { color: '#fff', fontWeight: '700', fontSize: 12 },

  filterBar: {
    flexDirection: 'row',
    gap: 6,
    alignSelf: 'stretch',
    paddingHorizontal: 4,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  filterPillPinned: { backgroundColor: '#4F8A75' },
  filterPinGlyph: { color: '#fff', fontSize: 14, fontWeight: '900' },
  filterPillText: { fontSize: 12, fontWeight: '600' },
  filterPillTextPinned: { color: '#fff' },

  sidebarWrap: { gap: 4, width: '100%', maxWidth: 220 },
  sidebarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: 'rgba(0,0,0,0.04)',
    borderRadius: 8,
  },
  sidebarRowDragging: {
    backgroundColor: 'rgba(79,138,117,0.15)',
    borderWidth: 1.5,
    borderColor: '#4F8A75',
    transform: [{ translateX: 6 }],
  },
  sidebarDragHandle: { fontSize: 14, color: '#8E8E93', fontWeight: '700' },
  sidebarRowLabel: { fontSize: 13, fontWeight: '500' },

  pebbleWrap: { alignItems: 'center', gap: 8 },
  pebbleLabel: { fontSize: 12, color: '#8E8E93', fontWeight: '600' },
  pebbleRow: { flexDirection: 'row', gap: 4 },
  pebbleGlyph: { fontSize: 24 },

  swatchRow: { flexDirection: 'row', gap: 10 },
  swatch: {
    width: 48,
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  },

  themeWrap: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatarCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#F7D9B4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEmoji: { fontSize: 32 },
  themeArrow: { fontSize: 22, color: '#8E8E93' },
  tintedRow: { flexDirection: 'row', gap: 6 },
  tintedSwatch: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  },
})

export const GUIDES: Guide[] = [
  {
    id: 'ai-fields',
    title: 'AI for to-dos',
    blurb: 'Type naturally — Sagely fills the fields.',
    icon: SparklesMenuIcon,
    glyph: '✨',
    slides: [
      {
        title: 'Tap-to-apply pills',
        body: "When you type a to-do, ambient suggestions appear above the form: category, priority, due date with time, recurrence, reminder. Nothing changes unless you tap a pill.",
        visual: (
          <MockupSheet title="Add to-do">
            <MockupTextField text="Buy birthday gift for Sam" />
            <MockupPills
              highlight
              pills={[
                { icon: <IconTag />, label: 'Family' },
                { icon: <IconCalendar />, label: 'Friday' },
              ]}
            />
            <MockupRow label="Category" value="Home" muted />
          </MockupSheet>
        ),
      },
      {
        title: 'Times + dates',
        body: "Try «pickup Mia at 3pm tomorrow». Completed by fills with the time. «every Mon and Wed» sets a weekly recurrence on those days.",
        visual: (
          <MockupSheet title="Add to-do">
            <MockupTextField text="Pickup Mia at 3pm tomorrow" />
            <MockupPills
              pills={[{ icon: <IconCalendar />, label: 'Tomorrow, 3:00 PM' }]}
            />
            <MockupRow
              icon={<IconCalendar />}
              label="Completed by"
              value="Tomorrow, 3:00 PM"
              highlight
            />
          </MockupSheet>
        ),
      },
      {
        title: 'New categories',
        body: "Type «renew passport» and Sagely proposes «Travel». Tap «+ Travel» and confirm to create it in your sidebar.",
        visual: (
          <MockupSheet title="Add to-do">
            <MockupTextField text="Renew passport" />
            <MockupPills
              highlight
              pills={[{ icon: <IconPlus />, label: 'Travel' }]}
            />
            <MockupRow label="Category" value="Home" muted />
          </MockupSheet>
        ),
      },
      {
        title: 'It stays quiet',
        body: "Pause typing for ~1.5s and pills appear. Keep typing and they wait. Turn it off entirely in Settings → AI assistance.",
        visual: (
          <MockupSheet title="Settings">
            <MockupRow label="Completion animation" value="On" />
            <MockupRow label="AI assistance" value="On" highlight />
            <MockupRow label="Background" value="Sea-glass" muted />
          </MockupSheet>
        ),
      },
    ],
  },
  {
    id: 'reminders',
    title: 'Reminders that repeat',
    blurb: 'One-shot or every N hours until a cutoff.',
    icon: BellMenuIcon,
    glyph: '🔔',
    slides: [
      {
        title: 'Set a reminder',
        body: "Open any to-do → Remind me → pick a date + time. iOS asks for notification permission the first time. The phone fires a quiet local notification at the chosen moment.",
        visual: (
          <MockupSheet title="Edit to-do">
            <MockupRow icon={<IconCalendar />} label="Completed by" value="Tomorrow" />
            <MockupRow icon={<IconRepeat />} label="Repeat" value="Never" muted />
            <MockupRow icon={<IconBell />} label="Remind me" value="None" muted highlight />
          </MockupSheet>
        ),
      },
      {
        title: 'Recurring reminders',
        body: "Same sub-view: tap an interval chip and Sagely schedules a series of pings up to the «Until» time. Defaults to your due date.",
        visual: (
          <MockupHighlight>
            <MockupChips
              chips={['Once', '15m', '30m', '1h', '2h', '4h']}
              activeIndex={4}
            />
          </MockupHighlight>
        ),
      },
      {
        title: 'AI sets them for you',
        body: "Type «remind me every 2 hours until 5pm» in the compose. The Bell pill carries the full spec — tap to apply.",
        visual: (
          <MockupSheet title="Add to-do">
            <MockupTextField text="Drink water, remind every 2h until 5pm" />
            <MockupPills
              highlight
              pills={[
                { icon: <IconBell />, label: 'every 2h until 5:00 PM' },
              ]}
            />
          </MockupSheet>
        ),
      },
      {
        title: 'Auto-cleanup',
        body: "Check the to-do off and every scheduled reminder cancels. Complete a recurring to-do and the reminder rolls forward to the next occurrence.",
        visual: (
          <View style={inlineStyles.stack}>
            <MockupTodo
              text="Drink water"
              done
              meta="reminders cancelled"
              highlight
            />
          </View>
        ),
      },
    ],
  },
  {
    id: 'subtasks',
    title: 'Break a task into steps',
    blurb: 'Suggest steps + clear all + roll-forward.',
    icon: ListChecks,
    glyph: '🪜',
    slides: [
      {
        title: 'Add a step',
        body: "Open a to-do → tap «+ Add a step…». Each step gets its own priority + due date, and counts toward today's pebble cairn when you check it.",
        visual: (
          <MockupSheet title="Edit to-do">
            <View style={inlineStyles.subsHeader}>
              <Text style={inlineStyles.subsHeaderText}>STEPS</Text>
            </View>
            <MockupTodo text="Outline the talk" />
            <MockupTodo text="Draft slide deck" />
            <View style={inlineStyles.addStepRow}>
              <Text style={inlineStyles.addStepText}>+ Add a step…</Text>
            </View>
          </MockupSheet>
        ),
      },
      {
        title: 'Suggest steps',
        body: "On a to-do with no steps yet, tap «Suggest steps» — Sagely proposes 3–6 concrete ones. Tap the ones you want, then «Add selected». Nothing is checked by default.",
        visual: (
          <MockupSheet title="Suggest steps">
            <MockupTodo text="Block 30 min on calendar" highlight />
            <MockupTodo text="Outline 3 main points" />
            <MockupTodo text="Find sample slides" />
          </MockupSheet>
        ),
      },
      {
        title: 'Start fresh',
        body: "Tap «Clear all steps» in the header to wipe and start over. The to-do itself stays — only the checklist resets.",
        visual: (
          <MockupSheet title="Edit to-do">
            <View style={[inlineStyles.subsHeader, inlineStyles.subsHeaderRow]}>
              <Text style={inlineStyles.subsHeaderText}>STEPS</Text>
              <View style={inlineStyles.clearAllChip}>
                <Text style={inlineStyles.clearAllText}>Clear all</Text>
              </View>
            </View>
            <MockupTodo text="Outline the talk" done />
            <MockupTodo text="Draft slide deck" />
          </MockupSheet>
        ),
      },
    ],
  },
  {
    id: 'groceries',
    title: 'Smart grocery list',
    blurb: 'Departments auto-fill. AI catches the store too.',
    icon: ShoppingBagMenuIcon,
    glyph: '🥬',
    slides: [
      {
        title: 'Local first',
        body: "Type «eggs» and Department flips to Dairy instantly — no network call. The list ships with ~250 common items.",
        visual: (
          <MockupSheet title="Add item">
            <MockupTextField text="Eggs" />
            <MockupRow label="Department" value="Dairy" highlight />
            <MockupRow label="Store" value="Any" muted />
          </MockupSheet>
        ),
      },
      {
        title: 'AI for misses',
        body: "Type «books from target» → after ~1.5s an AI pill suggests «+ Books» (a new department). Tap and confirm to create it. Same for stores.",
        visual: (
          <MockupSheet title="Add item">
            <MockupTextField text="Books from target" />
            <MockupPills
              highlight
              pills={[
                { icon: <IconPlus />, label: 'Books' },
                { icon: <IconStore />, label: 'Target' },
              ]}
            />
            <MockupRow label="Department" value="Miscellaneous" muted />
          </MockupSheet>
        ),
      },
      {
        title: 'Often picked up',
        body: "Your most-completed groceries surface in an «Often picked up» row at the top of the list. Tap any to add a fresh one without typing.",
        visual: (
          <View style={inlineStyles.oftenWrap}>
            <Text style={inlineStyles.oftenLabel}>OFTEN PICKED UP</Text>
            <View style={inlineStyles.oftenRow}>
              {['Milk', 'Bread', 'Bananas', 'Coffee'].map((label) => (
                <View key={label} style={inlineStyles.oftenChip}>
                  <Text style={inlineStyles.oftenChipText}>{label}</Text>
                </View>
              ))}
            </View>
          </View>
        ),
      },
      {
        title: 'Filter by store',
        body: "Tap the filter icon in the Groceries header to scope by store. Hide stores you don't shop at, reorder them, or set a default.",
        visual: (
          <View style={inlineStyles.headerBar}>
            <Text style={inlineStyles.headerBarTitle}>Groceries</Text>
            <View style={inlineStyles.headerBarRight}>
              <View style={inlineStyles.headerBarChip}>
                <Text style={inlineStyles.headerBarChipText}>Whole Foods</Text>
              </View>
              <View style={[inlineStyles.headerBarIcon, inlineStyles.headerBarIconHighlight]}>
                <Text style={inlineStyles.headerBarIconGlyph}>≡</Text>
              </View>
            </View>
          </View>
        ),
      },
    ],
  },
  {
    id: 'hidden-actions',
    title: 'Hidden gestures',
    blurb: 'Long-press, swipe, drag — the shortcuts.',
    icon: HandIcon,
    glyph: '👆',
    slides: [
      {
        title: 'Swipe + long-press',
        body: "Swipe a to-do left to send it to the trash bin. Long-press to open the defer picker (tomorrow, next week, custom). Tap to toggle done.",
        visual: (
          <View style={inlineStyles.swipeWrap}>
            <View style={inlineStyles.swipeRow}>
              <MockupTodo text="Mail tax return" />
            </View>
            <View style={inlineStyles.swipeAction}>
              <Text style={inlineStyles.swipeActionText}>Trash</Text>
            </View>
          </View>
        ),
      },
      {
        title: 'Pin a filter',
        body: "Long-press any filter pill (Today, Overdue, a category) to pin it to your quick-access bar. Long-press again to unpin.",
        visual: (
          <View style={inlineStyles.filterBar}>
            {[
              { label: 'All', pinned: false },
              { label: 'Today', pinned: true },
              { label: 'Overdue', pinned: false },
            ].map((f) => (
              <View
                key={f.label}
                style={[inlineStyles.filterPill, f.pinned && inlineStyles.filterPillPinned]}
              >
                {f.pinned && <Text style={inlineStyles.filterPinGlyph}>•</Text>}
                <Text
                  style={[
                    inlineStyles.filterPillText,
                    f.pinned && inlineStyles.filterPillTextPinned,
                  ]}
                >
                  {f.label}
                </Text>
              </View>
            ))}
          </View>
        ),
      },
      {
        title: 'Reorder categories',
        body: "In the sidebar, drag a category to reorder it. The order syncs across your devices.",
        visual: (
          <View style={inlineStyles.sidebarWrap}>
            {['Home', 'Work', 'Family'].map((label, i) => (
              <View
                key={label}
                style={[inlineStyles.sidebarRow, i === 1 && inlineStyles.sidebarRowDragging]}
              >
                <Text style={inlineStyles.sidebarDragHandle}>⋮⋮</Text>
                <Text style={inlineStyles.sidebarRowLabel}>{label}</Text>
              </View>
            ))}
          </View>
        ),
      },
      {
        title: 'Themed pebbles',
        body: "Pick a preset avatar (cat, dog, butterfly…) and your completion animation + cairn switch to a themed glyph: fish, bone, butterfly.",
        visual: (
          <View style={inlineStyles.pebbleWrap}>
            <Text style={inlineStyles.pebbleLabel}>3 today</Text>
            <View style={inlineStyles.pebbleRow}>
              {['🐟', '🐟', '🐟'].map((g, i) => (
                <Text key={i} style={inlineStyles.pebbleGlyph}>{g}</Text>
              ))}
            </View>
          </View>
        ),
      },
    ],
  },
  {
    id: 'personalize',
    title: 'Make it yours',
    blurb: 'Backgrounds, avatar theme, motion, sound.',
    icon: Palette,
    glyph: '🎨',
    slides: [
      {
        title: 'Backgrounds',
        body: "Settings → Background opens a picker with 8 calm palettes and 10 patterns. Each works in light + dark mode.",
        visual: (
          <View style={inlineStyles.swatchRow}>
            {['#E3ECEC', '#F5EFDC', '#ECEAEF', '#F4ECE7'].map((bg) => (
              <View key={bg} style={[inlineStyles.swatch, { backgroundColor: bg }]} />
            ))}
          </View>
        ),
      },
      {
        title: 'Theme from avatar',
        body: "Flip «Theme from avatar» and the FAB + app canvas tint to match your preset avatar's color family.",
        visual: (
          <View style={inlineStyles.themeWrap}>
            <View style={inlineStyles.avatarCircle}>
              <Text style={inlineStyles.avatarEmoji}>🐱</Text>
            </View>
            <Text style={inlineStyles.themeArrow}>→</Text>
            <View style={inlineStyles.tintedRow}>
              <View style={[inlineStyles.tintedSwatch, { backgroundColor: '#F7D9B4' }]} />
              <View style={[inlineStyles.tintedSwatch, { backgroundColor: '#EFC9B0' }]} />
              <View style={[inlineStyles.tintedSwatch, { backgroundColor: '#D88D5F' }]} />
            </View>
          </View>
        ),
      },
      {
        title: 'Calm by default',
        body: "Toggle off the completion animation, sound, or reduce motion for accessibility. The pebble cairn still grows — just quietly.",
        visual: (
          <MockupSheet title="Settings">
            <MockupRow label="Completion animation" value="On" />
            <MockupRow label="Completion sound" value="On" highlight />
            <MockupRow label="Reduce motion" value="Off" muted />
          </MockupSheet>
        ),
      },
    ],
  },
]

/** Look up a guide by id. Returns null when the catalog has been
 * pared down past a previously-stored `guidesSeen` entry. */
export function findGuide(id: string): Guide | null {
  return GUIDES.find((g) => g.id === id) ?? null
}

