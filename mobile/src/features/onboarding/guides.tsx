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
  MessageCircle,
  Palette,
  Sparkles as SparklesMenuIcon,
  type LucideIcon,
} from 'lucide-react-native'
import {
  MockupPills,
  MockupRow,
  MockupSheet,
  MockupTextField,
  MockupTodo,
  IconBell,
  IconCalendar,
  IconRepeat,
  IconTag,
} from './GuideMockups'
import { RADIUS, SPACING, TYPE } from '../../app/theme'

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

  subsHeader: { paddingHorizontal: SPACING.md, paddingTop: SPACING.xs },
  subsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  subsHeaderText: {
    fontSize: TYPE.caption,
    fontWeight: '700',
    color: '#8E8E93',
    letterSpacing: 0.6,
  },
  clearAllChip: {
    backgroundColor: 'rgba(79,138,117,0.18)',
    borderRadius: RADIUS.pill,
    paddingHorizontal: SPACING.md,
    paddingVertical: 3,
  },
  clearAllText: { fontSize: TYPE.caption, fontWeight: '600', color: '#4F8A75' },
  addStepRow: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: 'rgba(79,138,117,0.10)',
    borderRadius: RADIUS.control,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#4F8A75',
    borderStyle: 'dashed',
  },
  addStepText: { fontSize: TYPE.caption, fontWeight: '600', color: '#4F8A75' },

  oftenWrap: { gap: SPACING.sm, alignSelf: 'stretch', paddingHorizontal: SPACING.sm },
  oftenLabel: {
    fontSize: TYPE.caption,
    color: '#8E8E93',
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  oftenRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  oftenChip: {
    backgroundColor: 'rgba(79,138,117,0.15)',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.pill,
  },
  oftenChipText: { fontSize: TYPE.caption, color: '#4F8A75', fontWeight: '600' },

  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: 'rgba(0,0,0,0.04)',
    borderRadius: 10,
    width: '100%',
    maxWidth: 320,
  },
  headerBarTitle: { flex: 1, fontSize: TYPE.body, fontWeight: '600' },
  headerBarRight: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  headerBarChip: {
    backgroundColor: 'rgba(79,138,117,0.15)',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: RADIUS.pill,
  },
  headerBarChipText: { fontSize: TYPE.caption, fontWeight: '600', color: '#4F8A75' },
  headerBarIcon: {
    width: 30,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },
  headerBarIconHighlight: { borderWidth: 2, borderColor: '#4F8A75' },
  headerBarIconGlyph: { fontSize: TYPE.title, fontWeight: '700' },

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
    // Same calm sage as the real row's reversible Delete (TaskItem
    // swipeTrash) — red is only for permanent deletes.
    backgroundColor: '#8A998F',
  },
  swipeActionText: { color: '#1F2A24', fontWeight: '700', fontSize: TYPE.caption },

  // "Pin a filter": the Filter sheet, then the pinned pill it produces.
  pinWrap: { alignSelf: 'stretch', gap: SPACING.md },
  filterBar: {
    flexDirection: 'row',
    gap: SPACING.sm,
    alignSelf: 'stretch',
    paddingHorizontal: SPACING.xs,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.pill,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  filterPillPinned: { backgroundColor: '#4F8A75' },
  filterPinGlyph: { color: '#fff', fontSize: TYPE.body, fontWeight: '900' },
  filterPillText: { fontSize: TYPE.caption, fontWeight: '600' },
  filterPillTextPinned: { color: '#fff' },

  sidebarWrap: { gap: SPACING.xs, width: '100%', maxWidth: 220 },
  sidebarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: 'rgba(0,0,0,0.04)',
    borderRadius: 8,
  },
  sidebarRowDragging: {
    backgroundColor: 'rgba(79,138,117,0.15)',
    borderWidth: 1.5,
    borderColor: '#4F8A75',
    transform: [{ translateX: 6 }],
  },
  sidebarDragHandle: { fontSize: TYPE.body, color: '#8E8E93', fontWeight: '700' },
  sidebarRowLabel: { fontSize: TYPE.footnote, fontWeight: '500' },

  tallyWrap: { alignItems: 'center', gap: SPACING.sm },
  tallyLabel: { fontSize: TYPE.caption, color: '#8E8E93', fontWeight: '600' },
  tallyRow: { flexDirection: 'row', gap: SPACING.xs },
  tallyGlyph: { fontSize: TYPE.h2 },

  swatchRow: { flexDirection: 'row', gap: SPACING.sm },
  swatch: {
    width: 48,
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  },

  themeWrap: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  avatarCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#F7D9B4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEmoji: { fontSize: TYPE.h1 },
  themeArrow: { fontSize: TYPE.h2, color: '#8E8E93' },
  tintedRow: { flexDirection: 'row', gap: SPACING.sm },
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
    id: 'ask-mochi',
    title: 'Ask Mochi',
    blurb: 'Tap + and say it however you like.',
    icon: MessageCircle,
    glyph: '💬',
    slides: [
      {
        title: 'Say it however you like',
        body: "Tap + and say it however you like. Mochi's latest change always comes with an Undo.",
        visual: (
          <MockupSheet title="Ask Mochi">
            <MockupTextField text="Dentist Friday, and pick up milk" />
            <MockupTodo text="Call the dentist" meta="Friday" highlight />
          </MockupSheet>
        ),
      },
      {
        title: 'Prefer the form?',
        body: "Tap «Enter manually instead» to fill in the to-do yourself.",
        visual: (
          <MockupSheet title="Ask Mochi">
            <MockupRow label="Enter manually instead" highlight />
          </MockupSheet>
        ),
      },
    ],
  },
  {
    id: 'ai-fields',
    title: 'AI for to-dos',
    blurb: 'Mochi fills in the details for you.',
    icon: SparklesMenuIcon,
    glyph: '✨',
    slides: [
      {
        title: 'Times + dates',
        body: "Tell Mochi «pickup Mia at 3pm tomorrow» and Complete by fills with the time. «every Mon and Wed» sets a weekly repeat on those days.",
        visual: (
          <MockupSheet title="Ask Mochi">
            <MockupTextField text="Pickup Mia at 3pm tomorrow" />
            <MockupRow
              icon={<IconCalendar />}
              label="Complete by"
              value="Tomorrow, 3:00 PM"
              highlight
            />
          </MockupSheet>
        ),
      },
      {
        title: 'New categories',
        body: "Say «renew passport» and Mochi can file it under a new «Travel» category. Changed your mind? Tap Undo.",
        visual: (
          <MockupSheet title="Ask Mochi">
            <MockupTextField text="Renew passport" />
            <MockupRow icon={<IconTag />} label="Category" value="Travel" highlight />
          </MockupSheet>
        ),
      },
      {
        title: 'Typing it yourself',
        body: "In the form, a few small suggestions may appear above the fields. Nothing changes unless you tap one.",
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
          </MockupSheet>
        ),
      },
      {
        title: 'It stays quiet',
        body: "Turn AI help off entirely in Settings → AI assistance.",
        visual: (
          <MockupSheet title="Settings">
            <MockupRow label="AI assistance" value="On" highlight />
            <MockupRow label="Theme" value="Sage" muted />
          </MockupSheet>
        ),
      },
    ],
  },
  {
    id: 'reminders',
    title: 'Gentle reminders',
    blurb: 'A quiet nudge at the moment you pick.',
    icon: BellMenuIcon,
    glyph: '🔔',
    slides: [
      {
        title: 'Set a reminder',
        body: "Open any to-do → Remind me → pick a moment, like «Morning of» or «Day before». iOS asks for notification permission the first time. The phone fires a quiet local notification then.",
        visual: (
          <MockupSheet title="Edit to-do">
            <MockupRow icon={<IconCalendar />} label="Complete by" value="Tomorrow" />
            <MockupRow icon={<IconRepeat />} label="Repeat" value="Never" muted />
            <MockupRow icon={<IconBell />} label="Remind me" value="None" muted highlight />
          </MockupSheet>
        ),
      },
      {
        title: 'Gentle nudge',
        body: "Turn on Gentle nudge in the reminder sheet and Mochi checks in once — the morning after a to-do's last reminder, only if it's still open. Never more than once.",
        visual: (
          <MockupSheet title="Remind me">
            <MockupRow label="Day before" value="9:00 AM" />
            <MockupRow label="Gentle nudge" value="On" highlight />
          </MockupSheet>
        ),
      },
      {
        title: 'Mochi sets them for you',
        body: "Tell Mochi «call the dentist Friday, remind me the day before» and the reminder comes with it.",
        visual: (
          <MockupSheet title="Ask Mochi">
            <MockupTextField text="Call the dentist Friday, remind me the day before" />
            <MockupRow icon={<IconBell />} label="Remind me" value="Day before" highlight />
          </MockupSheet>
        ),
      },
      {
        title: 'Auto-cleanup',
        body: "Check the to-do off and every scheduled reminder cancels. Complete a recurring to-do and the reminder rolls forward to the next occurrence.",
        visual: (
          <View style={inlineStyles.stack}>
            <MockupTodo
              text="Call the dentist"
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
        body: "Open a to-do → tap «+ Add a step…». Each step gets its own priority and Complete by date. Checking the to-do's circle completes every step at once.",
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
        body: "Tap «Clear all steps» next to STEPS to start over. The to-do itself stays — only the checklist resets.",
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
    id: 'hidden-actions',
    title: 'Hidden gestures',
    blurb: 'Tap, swipe, drag — the shortcuts.',
    icon: HandIcon,
    glyph: '👆',
    slides: [
      {
        title: 'Tap, check, swipe',
        body: "Tap a to-do to open it. Tap its circle to mark it done — every check-off can be undone. Swipe a row for quick actions.",
        visual: (
          <View style={inlineStyles.swipeWrap}>
            <View style={inlineStyles.swipeRow}>
              <MockupTodo text="Mail tax return" />
            </View>
            <View style={inlineStyles.swipeAction}>
              <Text style={inlineStyles.swipeActionText}>Delete</Text>
            </View>
          </View>
        ),
      },
      {
        title: 'Pin a filter',
        body: "Tap the funnel and pick a filter in the Filter sheet — it shows as a pill above your list. Long-press that pill and choose Pin to keep it there.",
        visual: (
          <View style={inlineStyles.pinWrap}>
            <MockupSheet title="Filter" accent="Reset">
              <MockupRow label="Open" value="✓" highlight />
              <MockupRow label="Done" muted />
            </MockupSheet>
            <View style={inlineStyles.filterBar}>
              {[
                { label: 'All', pinned: false },
                { label: 'Open', pinned: true },
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
          </View>
        ),
      },
      {
        title: 'Reorder categories',
        body: "In Settings → Filters & categories, drag a category to reorder it. The order syncs across your devices.",
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
    ],
  },
  {
    id: 'personalize',
    title: 'Make it yours',
    blurb: 'Themes, motion, sound.',
    icon: Palette,
    glyph: '🎨',
    slides: [
      {
        title: 'Themes',
        body: "Settings → Theme offers six calm color themes. Each works in light and dark mode.",
        visual: (
          <View style={inlineStyles.swatchRow}>
            {['#E3ECEC', '#F5EFDC', '#ECEAEF', '#F4ECE7'].map((bg) => (
              <View key={bg} style={[inlineStyles.swatch, { backgroundColor: bg }]} />
            ))}
          </View>
        ),
      },
      {
        title: 'Calm by default',
        body: "Toggle off the completion animation or sound, or reduce motion, in Settings → Manage Animation & Sound.",
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

