/**
 * UX-review track A (lists & settings) — source guards + pure helpers.
 * RN UI isn't rendered in vitest, so the layout/copy decisions are pinned
 * by reading the source (same approach as round9-calm-guards).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { strings } from '../core-bindings/i18n'
import { TAB_LABEL_MAX_SCALE, tabLabelExtraHeight } from '../app/tabLabelScale'

const here = dirname(fileURLToPath(import.meta.url))
const read = (rel: string) => readFileSync(join(here, '..', rel), 'utf8')
const app = readFileSync(join(here, '..', '..', 'App.tsx'), 'utf8')
const en = strings.en

describe('Today: carried-over only', () => {
  const home = read('features/home/HomeScreen.tsx')
  it('keeps the TODAY header and offers Peek ahead past Carried over', () => {
    expect(home).toMatch(/todayDueItems\.length === 0 \? \(/)
    expect(home).toMatch(/\{quietTodayHeader\}\s*<View style=\{styles\.quietLineRow\}>/)
    expect(home).toMatch(/<Text style=\{styles\.quietLine\}>Nothing due today\.<\/Text>/)
    expect(home).toMatch(/nextGroupAfter\('overdue', null, groupsByKey\)/)
    expect(home).toMatch(/onPress=\{peekPastCarried\}/)
  })
  it('quiet-day copy leads with the calm part', () => {
    expect(home).toMatch(/'A quiet day\. Nothing on your plate\.'/)
    expect(en.emptyOpenTitle).toBe('A quiet day. Nothing on your plate.')
  })
})

describe('Priority glyph is one shape everywhere', () => {
  it('PriorityDot renders the filter sheet bars', () => {
    const dot = read('ui/PriorityDot.tsx')
    expect(dot).toMatch(/<PriorityBars level=\{level\}/)
    expect(dot).not.toMatch(/borderRadius/)
  })
  it('bars take their ink from priorityGlyphColor, not the static palette', () => {
    const bars = read('ui/PriorityBars.tsx')
    expect(bars).toMatch(/const fill = priorityGlyphColor\(theme, level\)/)
    expect(bars).not.toMatch(/PRIORITY_COLORS/)
  })
})

describe('Todos list', () => {
  it('"Defer all" only on an expanded Carried over group', () => {
    expect(app).toMatch(/openInGroupCount > 0 &&\s*group\.key === 'overdue' &&\s*!collapsed && \(/)
  })
  it('bin footer reads "N in Done · View" (a11y identical) and hides during search', () => {
    expect(en.binFooter.peek(4)).toBe('4 in Done · View')
    expect(en.binFooter.a11y(4)).toBe(en.binFooter.peek(4))
    expect(app).toMatch(/store\.filter !== "done" &&\s*searchNeedle\.length === 0 &&/)
  })
  it('list bottom padding clears the FAB; FAB hides while search is up', () => {
    const fab = read('app/Fab.tsx')
    expect(fab).toMatch(/export const FAB_LIST_CLEARANCE = FAB_SIZE \+ FAB_BASE_OFFSET \+ 24/)
    expect(app).toMatch(/listContent: \{[^}]*paddingBottom: FAB_LIST_CLEARANCE,/)
    expect(app).toMatch(/container: \{[^}]*paddingBottom: FAB_LIST_CLEARANCE,/)
    expect(app).toMatch(/store\.filter !== "groceries" &&\s*!searchOpen && \(/)
  })
  it('an open swipe row closes on scroll and on tab blur', () => {
    expect(read('features/task/TaskItem/index.tsx')).toMatch(/export function closeOpenSwipeable\(\): void/)
    expect(app.match(/onScrollBeginDrag=\{closeOpenSwipeable\}/g)?.length).toBe(3)
    expect(app).toMatch(/if \(!isFocused\) closeOpenSwipeable\(\);/)
    const home = read('features/home/HomeScreen.tsx')
    expect(home).toMatch(/onScrollBeginDrag=\{closeOpenSwipeable\}/)
    expect(home).toMatch(/if \(!isFocused\) closeOpenSwipeable\(\)/)
  })
  it('swipe actions use outline Lucide icons (no hand-drawn Skip disc)', () => {
    const item = read('features/task/TaskItem/index.tsx')
    expect(item).toMatch(/<CircleX size=\{20\} color=\{SWIPE_INK\}/)
    expect(item).not.toMatch(/notDoIcon/)
  })
})

describe('Filter sheet', () => {
  const sheet = read('features/category/CategorySheet/index.tsx')
  it('is titled "Filter", commits with "Show results", and has no Cancel', () => {
    expect(sheet).toMatch(/isEditing \? t\.filtersAndCategories : 'Filter'/)
    expect(sheet).toMatch(/<Text style=\{styles\.viewDoneText\}>Show results<\/Text>/)
    expect(sheet).not.toMatch(/Set Filter|Select Filter/)
  })
  it('never counts Carried over', () => {
    expect(sheet).toMatch(/const showCount = s\.id !== 'overdue';/)
    expect(sheet).toMatch(/\{showCount && <Text style=\{styles\.viewRowCount\}>\{count\}<\/Text>\}/)
  })
})

describe('Guides', () => {
  it('"Pin a filter" teaches the Filter sheet, not a hidden pill row', () => {
    const guides = read('features/onboarding/guides.tsx')
    expect(guides).toMatch(/pick a filter in the Filter sheet/)
    expect(guides).toMatch(/<MockupSheet title="Filter" accent="Reset">/)
  })
  it('mockups are hidden from VoiceOver', () => {
    const sheet = read('features/onboarding/GuideSheet.tsx')
    expect(sheet).toMatch(/style=\{styles\.visualWrap\}\s*accessibilityElementsHidden\s*importantForAccessibility="no-hide-descendants"/)
    const mock = read('features/onboarding/GuideMockups.tsx')
    expect(mock.match(/\{\.\.\.MOCKUP_A11Y_HIDDEN\}/g)?.length).toBe(5)
  })
})

describe('Done bin', () => {
  it('has ONE permanent control: "Empty Done…" as red text, confirmed', () => {
    expect(en.clearAllCompleted).toBe('Empty Done…')
    expect(en.emptyTrashConfirm(3)).toBe("Permanently delete everything in Done? This can't be undone.")
    expect(app).not.toMatch(/Delete all →/)
    expect(app).toMatch(/emptyDoneText: \{\s*color: c\.red,/)
    const slice = read('store/slices/useTodosSlice.ts')
    expect(slice).toMatch(/alertWithPresence\("Empty Done\?", t\.emptyTrashConfirm\(count\)/)
  })
})

describe('Settings', () => {
  const settings = read('features/profile/SettingsSheet.tsx')
  it('one Done, no Cancel (changes apply immediately)', () => {
    expect(settings).toMatch(/primary=\{\{ label: t\.done, onPress: onClose \}\}/)
    expect(settings).toMatch(/left=\{null\}/)
  })
  it('Data (with Delete account) sits below About', () => {
    const about = settings.indexOf('>ABOUT<')
    expect(about).toBeGreaterThan(0)
    expect(settings.indexOf('{t.dataSection}')).toBeGreaterThan(about)
    expect(settings.indexOf('t.deleteAccountConfirm')).toBeGreaterThan(about)
  })
  it('no "On by default." helper; sentence-case labels', () => {
    expect(en.aiAssistanceHint).not.toMatch(/On by default/)
    expect(settings).toMatch(/>Animation &amp; sound</)
    expect(settings).not.toMatch(/Manage Animation &amp; Sound|Sagely Membership/)
  })
})

describe('Tab labels follow Dynamic Type, capped', () => {
  it('grows the bar by exactly the scaled label', () => {
    expect(tabLabelExtraHeight(1)).toBe(0)
    expect(tabLabelExtraHeight(0.8)).toBe(0)
    expect(tabLabelExtraHeight(1.2)).toBe(Math.ceil(11 * 1.2 * 0.2))
    // Capped: anything past the max scale adds the same as the max.
    expect(tabLabelExtraHeight(3.1)).toBe(tabLabelExtraHeight(TAB_LABEL_MAX_SCALE))
    expect(TAB_LABEL_MAX_SCALE).toBe(1.4)
  })
  it('the label component sets the cap', () => {
    expect(app).toMatch(/maxFontSizeMultiplier=\{TAB_LABEL_MAX_SCALE\}/)
    expect(app).toMatch(/tabBarLabel: TabLabel,/)
  })
})
