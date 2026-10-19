/** Avatar: a user photo (file/remote URI) or a bundled preset. */
export type Avatar =
  | { kind: 'image';  uri: string }
  | { kind: 'preset'; key: string }

/** Source for the home-screen subtitle quote. See Profile.quoteMode. */
export type QuoteMode = 'daily' | 'custom' | 'off'

/**
 * Color themes. Each name maps to a full light+dark palette (the mapping
 * lives in the mobile client's `theme.ts` THEMES table). Sage is the calm
 * default; sky is the free alternative; blossom/honey/cream are the premium
 * pack (gated by `canUseThemes`).
 */
export type ThemeName = 'sage' | 'sky' | 'blossom' | 'honey' | 'cream' | 'lilac'
export const THEME_NAMES: ThemeName[] = ['sage', 'sky', 'lilac', 'blossom', 'honey', 'cream']
export function isThemeName(v: unknown): v is ThemeName {
  return typeof v === 'string' && (THEME_NAMES as string[]).includes(v)
}

import type { ViewMode, StatusFilter, Priority } from '../domain/types'

export interface StatusOverride {
  id: StatusFilter
  /** User-set label override; falls back to t.filters[id]. */
  label?: string
  /** When true, this status is hidden from the filter row. */
  hidden?: boolean
}

export interface PriorityOverride {
  id: Priority
  /** When true, this priority is hidden from filter pickers. */
  hidden?: boolean
}

export interface Profile {
  name: string
  firstName?: string
  lastName?: string
  /** The user's own custom subtitle quote (used when quoteMode === 'custom'). */
  quote?: string
  /**
   * Home subtitle quote source:
   *  - 'daily'  → an auto-rotating curated quote (date-seeded, see quotes.ts)
   *  - 'custom' → the user's own `quote` text
   *  - 'off'    → no subtitle
   * Undefined is treated as 'custom' by the store (the subtitle shows the
   * `quote` text, or nothing when it's empty).
   */
  quoteMode?: QuoteMode
  /**
   * Optional per-day "show me another" override for the daily quote. Holds
   * the local ISO day it was chosen + the quote index; ignored once the day
   * rolls over (so the daily rotation resumes automatically at midnight).
   */
  quoteShuffle?: { date: string; index: number }
  /**
   * Which capture surface the add-FAB reopens — the one the user used last.
   * 'manual' = the compose form, 'mochi' = the Ask Mochi chat. Set by the
   * "Ask Mochi instead" / "Enter manually instead" switch links.
   */
  lastComposeMode?: 'manual' | 'mochi'
  avatar: Avatar
  /**
   * Anxiety-friendly setting: when true, the app suppresses non-essential
   * motion regardless of the OS Reduce Motion setting.
   */
  reduceMotion?: boolean
  /** Last selected grouping (category vs status). Persisted across launches. */
  view?: ViewMode
  /** Per-status overrides (rename, hide, reorder). Array order determines display order. */
  statuses?: StatusOverride[]
  /** Per-priority overrides (hide, reorder). Array order determines display order. */
  priorities?: PriorityOverride[]
  /** Show a calm completion animation when a task is marked done. Defaults to true. */
  completionAnimation?: boolean
  /** Play a sound when a task is marked done. Defaults to true. (Sound playback NYI.) */
  completionSound?: boolean
  /**
   * Selected color theme — drives the full app palette (background, cards,
   * header, text, accent). See the mobile client's `theme.ts` THEMES table.
   * Defaults to 'sage'.
   */
  theme?: ThemeName
  /**
   * True once the user has seen (or skipped) the first-launch onboarding
   * flow. Undefined means "needs onboarding"; set to true the first time
   * they finish or skip.
   */
  onboardingDone?: boolean
  /**
   * Per-guide completion record — each id corresponds to an entry
   * in the GUIDES catalog. Lets the Tips & Guides menu render a
   * check next to ones the user has finished, and prevents the
   * first-run prompt from offering already-seen guides.
   */
  guidesSeen?: string[]
  /**
   * True once the user has seen (or dismissed) the "Want a quick
   * tour?" first-run prompt that surfaces after onboarding. Set
   * regardless of whether they accepted — we only ask once.
   */
  guidesPromptShown?: boolean
  /**
   * Daily check-in notification settings. When enabled, the app schedules
   * a single repeating local notification at the chosen hour with a
   * mascot-voice nudge. Hour is 0-23 in the user's local timezone;
   * defaults to 9 (morning) when first enabled.
   */
  dailyCheckinEnabled?: boolean
  dailyCheckinHour?: number
  /**
   * Enables the Mochi agent (conversational helper that creates / edits
   * to-dos from natural-language input). Off by default — opt-in via
   * the Profile sheet. Server-side cap on free turns/day; details in
   * the architecture doc. Storing on Profile so the choice syncs across
   * the user's devices.
   */
  agentEnabled?: boolean
  /**
   * Gentle nudge: one quiet follow-up notification at 9:00 the morning after
   * a to-do's last reminder, only if it's still open. Off by default; set
   * from the reminder sheet and remembered for every to-do.
   */
  gentleNudge?: boolean
  /**
   * Filters the user has pinned as quick-access pills in the FilterBar.
   * Stored as raw `Filter` strings (e.g. `'open'` or `'cat:home'`) so
   * category pins follow the user even if the category list reorders.
   * Order is preserved — first-pinned-first-shown. Launch always opens
   * on `'all'`; pins are just shortcut pills.
   *
   * Each entry is a SET — single-filter pills are stored as
   * single-element arrays (`['done']`), composite pills as multi-
   * element arrays (`['done','cat:work']`). Tapping a pinned set
   * activates that whole multi-filter selection.
   */
  pinnedFilters?: string[][]
  /**
   * Filters the user has picked as stat tiles on the Dashboard. Ordered
   * (index 0 = leftmost). Stored as raw `Filter` strings (same shape as
   * `pinnedFilters`) so picks survive category reorder. No cap — the
   * Dashboard row scrolls horizontally if the user picks many. When
   * undefined the effective tiles default to ['cat:home','cat:work','done'];
   * an explicit empty array hides the row entirely. */
  homeStatTiles?: string[]
  /**
   * Show the Groceries view toggle at the top of the home screen.
   * Defaults to true (the feature is discoverable on first launch).
   * Users who don't want it can hide it in Settings — the toggle
   * disappears and the screen renders Todos only.
   */
  groceriesEnabled?: boolean
  /**
   * Last-active grocery store filter ("Costco", "Trader Joe's"). Empty /
   * undefined means "show all stores". Persisted so switching to
   * Groceries view doesn't reset to the all-stores view every time.
   */
  activeGroceryStore?: string
  /**
   * Last store picked on the Add Item compose sheet. Distinct from
   * `activeGroceryStore` (the filter pill) — a user may filter to
   * "Costco" but add to "Trader Joe's". Persisted so a fresh launch's
   * first add starts where the user left off. `undefined` = "Any" and
   * is preserved across launches.
   */
  lastAddedGroceryStore?: string
  /**
   * Ordered, explicit list of grocery store names. Auto-registered when
   * the user adds a grocery item with a new store. Editable in the
   * Configure Filter sheet → Groceries tab → STORES section (rename,
   * reorder, delete). Storing the order explicitly lets the user pick
   * how the store-switcher dropdown sorts.
   */
  groceryStores?: string[]
  /**
   * Stores the user has hidden from the STORES list (still in
   * groceryStores so their items survive, but suppressed from view-mode
   * picker rows). Names that are no longer in groceryStores get cleaned
   * out on migration.
   */
  hiddenGroceryStores?: string[]
  /**
   * Stores the user has pinned to the Groceries filter pill row.
   * Pinned stores always render as pills (with a pin glyph) regardless
   * of the active filter; non-pinned stores stay reachable via the
   * Manage Filter sheet. Mirrors `pinnedFilters` for Todos.
   */
  pinnedGroceryStores?: string[]
  /**
   * Active department-id filter for the grocery view. When set, the
   * list narrows to items in that department (in addition to the
   * activeGroceryStore filter). Undefined / empty means "all
   * departments". Pickable from the Select-Filter sheet's
   * DEPARTMENTS section.
   */
  activeGroceryDept?: string
  /**
   * Department-ids the user has pinned to the Groceries filter pill
   * row. Pinned depts render alongside pinned stores so common
   * categories (Dairy, Produce) are reachable in one tap without
   * opening the Select-Filter sheet. Mirrors `pinnedGroceryStores`.
   * Toggled via long-press on any visible dept pill.
   */
  pinnedGroceryDepts?: string[]
}

export const SEED_PROFILE: Profile = {
  // Blank, NOT a real name: the seed is what a signed-out user, a failed
  // profile read, or a sign-in without a display name falls back to — it used
  // to be the developer's name ("Good morning, Ying" to strangers). Every
  // display path falls back to its neutral default when the name is empty.
  name: '',
  avatar: { kind: 'preset', key: 'mochi' },
  completionSound: true,
  completionAnimation: true,
  reduceMotion: false,
}

/** Hard caps applied at hydration. Defensive against malicious cloud writes. */
export const MAX_PROFILE_NAME_LEN = 64
export const MAX_PROFILE_QUOTE_LEN = 240
/**
 * Avatar URI cap. Reject anything > 1 MB as a defense against bad data —
 * also keeps profile docs under Firestore's 1 MB doc limit.
 */
export const MAX_AVATAR_URI_LEN = 1_000_000

export interface PresetAvatar {
  key: string
  emoji: string
  bg: string
  /**
   * Optional bundled-image key. When set, the Avatar component renders the
   * bundled (require'd) image instead of the emoji. The emoji is kept as a fallback for environments where the
   * image can't load.
   */
  imageKey?: string
}

/**
 * Cross-platform emoji preset library — curated for the calm-app stance.
 * Backgrounds are drawn from the Sagely pair palette (sage, mint, peach,
 * sea-glass, lavender, honey, misty rose) so avatars match the rest of the
 * UI instead of fighting it with bright system colors.
 *
 * Stable keys so cross-device sync works.
 */
export const AVATAR_PRESET_LIBRARY: PresetAvatar[] = [
  // Backgrounds are hand-picked muted hues that read as the subject's
  // natural habitat / palette rather than generic pair colors. When a
  // PNG illustration is dropped at `mobile/assets/preset-avatars/<key>.png`
  // and the corresponding `require` is added to PRESET_IMAGES in
  // mobile/src/components/Avatar.tsx, that art replaces the emoji
  // automatically — no other wiring needed. Emoji stays the fallback.
  { key: 'mochi',     emoji: '🐢',  bg: '#E8F0E5', imageKey: 'mochi' },     // brand mascot — uses bundled PNG today
  { key: 'cat',       emoji: '🐱',  bg: '#D7C4B5', imageKey: 'cat' },       // warm clay
  { key: 'dog',       emoji: '🐶',  bg: '#E8DCC4', imageKey: 'dog' },       // cream biscuit
  { key: 'bird',      emoji: '🐦',  bg: '#BFD0DC', imageKey: 'bird' },      // powder blue sky
  { key: 'fish',      emoji: '🐠',  bg: '#BDD7D2', imageKey: 'fish' },      // sea foam
  { key: 'butterfly', emoji: '🦋',  bg: '#C8BCD1', imageKey: 'butterfly' }, // soft heather
  { key: 'owl',       emoji: '🦉',  bg: '#C9B89A', imageKey: 'owl' },       // walnut beige
  { key: 'elephant',  emoji: '🐘',  bg: '#C2C7CC', imageKey: 'elephant' },  // slate grey
  { key: 'whale',     emoji: '🐋',  bg: '#B3C4CC', imageKey: 'whale' },     // deep ocean blue
  { key: 'squirrel',  emoji: '🐿️', bg: '#D4B89A', imageKey: 'squirrel' },  // warm autumn tan
  { key: 'rabbit',    emoji: '🐰',  bg: '#E1C8C8', imageKey: 'rabbit' },    // rose blush
]

export function findPreset(key: string): PresetAvatar {
  return AVATAR_PRESET_LIBRARY.find((a) => a.key === key) ?? AVATAR_PRESET_LIBRARY[0]
}

/**
 * Read-time sanitizer for a stored profile. All string fields are
 * length-capped and every field is type-checked, to defend against
 * malicious cloud pushes; invalid fields drop to undefined.
 */
export function migrateProfile(raw: unknown): Profile {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return SEED_PROFILE
  const p = raw as Record<string, unknown>
  // An EMPTY name is valid (the seed itself is blank) — only a missing/non-
  // string name or avatar means the doc is unusable. Rejecting '' here would
  // replace a whole saved profile with the seed on every load.
  if (typeof p.name !== 'string' || !p.avatar) return SEED_PROFILE
  const avatar = migrateAvatar(p.avatar)
  if (!avatar) return SEED_PROFILE
  return {
    name: p.name.slice(0, MAX_PROFILE_NAME_LEN),
    firstName:
      typeof p.firstName === 'string' && p.firstName.length > 0
        ? p.firstName.slice(0, MAX_PROFILE_NAME_LEN)
        : undefined,
    lastName:
      typeof p.lastName === 'string' && p.lastName.length > 0
        ? p.lastName.slice(0, MAX_PROFILE_NAME_LEN)
        : undefined,
    quote:
      typeof p.quote === 'string' && p.quote.length > 0
        ? p.quote.slice(0, MAX_PROFILE_QUOTE_LEN)
        : undefined,
    avatar,
    reduceMotion: typeof p.reduceMotion === 'boolean' ? p.reduceMotion : undefined,
    view: p.view === 'category' || p.view === 'status' ? p.view : undefined,
    statuses: migrateStatuses(p.statuses),
    priorities: migratePriorities(p.priorities),
    completionAnimation:
      typeof p.completionAnimation === 'boolean' ? p.completionAnimation : undefined,
    theme: isThemeName(p.theme) ? p.theme : undefined,
    quoteMode:
      p.quoteMode === 'daily' || p.quoteMode === 'custom' || p.quoteMode === 'off'
        ? p.quoteMode
        : undefined,
    quoteShuffle:
      p.quoteShuffle &&
      typeof p.quoteShuffle === 'object' &&
      typeof (p.quoteShuffle as { date?: unknown }).date === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test((p.quoteShuffle as { date: string }).date) &&
      typeof (p.quoteShuffle as { index?: unknown }).index === 'number' &&
      Number.isFinite((p.quoteShuffle as { index: number }).index)
        ? {
            date: (p.quoteShuffle as { date: string }).date,
            index: Math.max(0, Math.floor((p.quoteShuffle as { index: number }).index)),
          }
        : undefined,
    lastComposeMode:
      p.lastComposeMode === 'manual' || p.lastComposeMode === 'mochi'
        ? p.lastComposeMode
        : undefined,
    completionSound:
      typeof p.completionSound === 'boolean' ? p.completionSound : undefined,
    onboardingDone: p.onboardingDone === true ? true : undefined,
    gentleNudge: p.gentleNudge === true ? true : undefined,
    guidesSeen: Array.isArray(p.guidesSeen)
      ? [
          ...new Set(
            p.guidesSeen.filter(
              (id: unknown): id is string =>
                typeof id === 'string' && id.length > 0 && id.length < 64,
            ),
          ),
        ].slice(0, MAX_GUIDES_SEEN)
      : undefined,
    guidesPromptShown: p.guidesPromptShown === true ? true : undefined,
    dailyCheckinEnabled: p.dailyCheckinEnabled === true ? true : undefined,
    dailyCheckinHour:
      typeof p.dailyCheckinHour === 'number' &&
      p.dailyCheckinHour >= 0 &&
      p.dailyCheckinHour <= 23
        ? Math.floor(p.dailyCheckinHour)
        : undefined,
    pinnedFilters: migratePinnedFilters(p.pinnedFilters),
    homeStatTiles: migrateHomeStatTiles(p.homeStatTiles),
    groceriesEnabled: p.groceriesEnabled === false ? false : undefined,
    activeGroceryStore:
      typeof p.activeGroceryStore === 'string' && p.activeGroceryStore.length > 0
        ? p.activeGroceryStore.slice(0, 64)
        : undefined,
    lastAddedGroceryStore:
      typeof p.lastAddedGroceryStore === 'string' && p.lastAddedGroceryStore.length > 0
        ? p.lastAddedGroceryStore.slice(0, MAX_GROCERY_STORE_NAME_LEN)
        : undefined,
    groceryStores: migrateGroceryStores(p.groceryStores),
    hiddenGroceryStores: migrateGroceryStores(p.hiddenGroceryStores),
    pinnedGroceryStores: migrateGroceryStores(p.pinnedGroceryStores),
    activeGroceryDept:
      typeof p.activeGroceryDept === 'string' && p.activeGroceryDept.length > 0
        ? p.activeGroceryDept.slice(0, 64)
        : undefined,
    pinnedGroceryDepts: migrateGroceryStores(p.pinnedGroceryDepts),
  }
}

/** Ceiling on remembered guide ids — the catalog is a handful; this only
 * bounds a malformed cloud write. */
const MAX_GUIDES_SEEN = 64
const MAX_GROCERY_STORES = 30
const MAX_GROCERY_STORE_NAME_LEN = 64

function migrateGroceryStores(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const seen = new Set<string>()
  const out: string[] = []
  for (const r of raw) {
    if (typeof r !== 'string') continue
    const s = r.trim().slice(0, MAX_GROCERY_STORE_NAME_LEN)
    if (s.length === 0 || seen.has(s)) continue
    seen.add(s)
    out.push(s)
    if (out.length >= MAX_GROCERY_STORES) break
  }
  return out.length > 0 ? out : undefined
}

/** Same shape as `migratePinnedFilters`. No hard cap on count — the
 * Dashboard scrolls horizontally — but we still apply the same 12-item
 * safety ceiling that pinned filters use, to defend against malformed
 * cloud writes. */
function migrateHomeStatTiles(raw: unknown): string[] | undefined {
  const valid = (s: unknown): s is string => {
    if (typeof s !== 'string' || s.length === 0) return false
    if (s === 'all' || s === 'open' || s === 'overdue' || s === 'done' || s === 'trash') {
      return true
    }
    return s.startsWith('cat:') && s.length > 4 && s.length <= 200
  }
  if (!Array.isArray(raw)) return undefined
  const items: string[] = []
  for (const item of raw) {
    if (valid(item) && !items.includes(item)) items.push(item)
    if (items.length >= 12) break
  }
  return items.length > 0 ? items : undefined
}

/** Validator for the persisted `pinnedFilters` list of filter SETS. Accepts
 * the canonical system filters, `cat:<non-empty-id>` and `pri:<priority>`.
 * Dedupes (order-insensitively) and caps at 12 sets (sane upper bound — the
 * FilterBar row would scroll past viewport long before then). */
function migratePinnedFilters(raw: unknown): string[][] | undefined {
  const valid = (s: unknown): s is string => {
    if (typeof s !== 'string' || s.length === 0) return false
    if (s === 'all' || s === 'open' || s === 'overdue' || s === 'done' || s === 'trash') {
      return true
    }
    if (s.startsWith('cat:') && s.length > 4 && s.length <= 200) return true
    if (s.startsWith('pri:') && (s === 'pri:high' || s === 'pri:medium' || s === 'pri:low')) return true
    return false
  }
  // Set equality — order-insensitive dedupe across pinned entries so
  // ['done','cat:work'] and ['cat:work','done'] don't end up as two
  // separate pills.
  const setKey = (set: string[]) => [...set].sort().join(' ')
  const seen = new Set<string>()
  const sets: string[][] = []
  const pushSet = (set: string[]) => {
    const cleaned: string[] = []
    for (const s of set) {
      if (valid(s) && !cleaned.includes(s)) cleaned.push(s)
    }
    if (cleaned.length === 0) return
    const key = setKey(cleaned)
    if (seen.has(key)) return
    seen.add(key)
    sets.push(cleaned)
  }
  if (!Array.isArray(raw)) return undefined
  for (const item of raw) {
    if (Array.isArray(item)) pushSet(item as unknown[] as string[])
    if (sets.length >= 12) break
  }
  return sets.length > 0 ? sets : undefined
}

const VALID_STATUS_IDS: StatusFilter[] = ['overdue', 'open', 'done', 'trash']
const MAX_STATUS_LABEL_LEN = 40
const VALID_PRIORITY_IDS: Priority[] = ['high', 'medium', 'low']

function migratePriorities(raw: unknown): PriorityOverride[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const seen = new Set<Priority>()
  const result: PriorityOverride[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const id = o.id
    if (typeof id !== 'string' || !VALID_PRIORITY_IDS.includes(id as Priority)) continue
    if (seen.has(id as Priority)) continue
    seen.add(id as Priority)
    result.push({
      id: id as Priority,
      hidden: o.hidden === true ? true : undefined,
    })
  }
  return result.length > 0 ? result : undefined
}

function migrateStatuses(raw: unknown): StatusOverride[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const seen = new Set<StatusFilter>()
  const result: StatusOverride[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const id = o.id
    if (typeof id !== 'string' || !VALID_STATUS_IDS.includes(id as StatusFilter)) continue
    if (seen.has(id as StatusFilter)) continue
    seen.add(id as StatusFilter)
    result.push({
      id: id as StatusFilter,
      label:
        typeof o.label === 'string' && o.label.length > 0
          ? o.label.slice(0, MAX_STATUS_LABEL_LEN)
          : undefined,
      hidden: o.hidden === true ? true : undefined,
    })
  }
  return result.length > 0 ? result : undefined
}

function migrateAvatar(raw: unknown): Avatar | null {
  if (!raw || typeof raw !== 'object') return null
  const a = raw as Record<string, unknown>
  if (a.kind === 'image') {
    if (typeof a.uri !== 'string' || a.uri.length === 0) return null
    if (a.uri.length > MAX_AVATAR_URI_LEN) return null
    return { kind: 'image', uri: a.uri }
  }
  if (a.kind === 'preset' && typeof a.key === 'string') {
    // Unknown keys pass through; renderers fall back to the mochi preset
    // (findPreset / ProfileSheet's normalizeAvatar).
    return { kind: 'preset', key: a.key.slice(0, 64) }
  }
  return null
}
