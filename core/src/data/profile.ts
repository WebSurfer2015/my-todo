/**
 * Avatar is a discriminated union with three kinds. Web traditionally uses
 * `image` (data URL) and `icon` (lucide); mobile uses `image` (file/remote URI)
 * and `preset` (emoji preset). To keep cross-device data interchangeable, the
 * union admits all three kinds and each platform's <Avatar> falls back
 * gracefully when it encounters a kind it doesn't natively render.
 */
export type Avatar =
  | { kind: 'image';  uri: string }                       // web data URL or mobile file/remote URI
  | { kind: 'icon';   icon: string; color: string }       // web's lucide-style icon
  | { kind: 'preset'; key: string }                       // mobile's emoji preset key

export type Density = 'comfortable' | 'compact'

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
  quote?: string
  avatar: Avatar
  density?: Density
  title?: string
  /**
   * Anxiety-friendly setting: when true, the app suppresses non-essential
   * motion (slide-ins, hover transitions) regardless of the OS prefers-reduced-
   * motion setting. Honored on web via [data-reduce-motion] on .app-shell.
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
   * When true, the app's accent (FAB color, pill backgrounds, etc.)
   * is derived from the current avatar so the chrome quietly
   * matches the user's chosen identity. Off by default — the
   * static sage-teal palette is calm and brand-consistent for
   * users who don't opt in.
   *
   * v1: preset avatars only (uses preset.bg directly).
   * Photo/icon avatars fall back to the static palette.
   */
  themeFromAvatar?: boolean
  /**
   * Pebbles — live progress indicator with two scopes:
   *
   * - `todayTaskPebbles` / `todaySubtaskPebbles` mirror today's actual
   *   completions. They go UP when a task/subtask is checked done and DOWN
   *   when it's un-checked (min 0). At local midnight (pebblesDate change)
   *   both reset to 0.
   *
   * - `lifetimePebbles` mirrors total completions over time and moves in
   *   both directions: a check-off increments, an uncheck decrements (min
   *   0). Trashing a completed task still removes its pebble. Shown on
   *   the Profile sheet's YOUR JOURNEY card.
   *
   * Splitting today into task vs subtask lets the UI render them at
   * different sizes (big stones for tasks, small stones for subtasks).
   */
  lifetimePebbles?: number
  todayTaskPebbles?: number
  todaySubtaskPebbles?: number
  /** Local ISO date (yyyy-mm-dd) of the day the today counters belong to. */
  pebblesDate?: string
  /**
   * True once the user has seen (or skipped) the first-launch onboarding
   * flow. Defaults to undefined for legacy profiles — we treat undefined
   * as "needs onboarding" so existing users get the introduction once.
   * Set to true the first time they finish or skip.
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
   * Filters the user has pinned as quick-access pills in the FilterBar.
   * Stored as raw `Filter` strings (e.g. `'open'` or `'cat:home'`) so
   * category pins follow the user even if the category list reorders.
   * Order is preserved — first-pinned-first-shown. Launch always opens
   * on `'all'`; pins are just shortcut pills.
   *
   * Each entry is a SET — single-filter pills are stored as
   * single-element arrays (`['done']`), composite pills as multi-
   * element arrays (`['done','cat:work']`). Tapping a pinned set
   * activates that whole multi-filter selection. Legacy flat
   * `string[]` values from older builds are migrated to one
   * single-element set per entry on load.
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
   * App background choice — pairs a pattern key (e.g. 'solid', 'gradient',
   * 'blob') with a color-pair key (e.g. 'cream', 'mochi-shell'). Rendering
   * lives in the mobile workspace; core stores raw strings and lets the
   * renderer fall back to the default when a key is unknown. Missing field
   * = the default cream-solid look (zero diff from v1.0.x).
   */
  background?: BackgroundChoice
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
  /**
   * One-shot device flag set true after the R2 recurring-redesign
   * migration runs. Gates `migrateToRecurringV2` so it only walks the
   * todo list on the first launch after the v2 client. Persisted in
   * the profile so it syncs across devices — once any device migrates,
   * others see the result and skip re-running.
   */
  recurringV2?: boolean
}

export interface BackgroundChoice {
  pattern: string
  pairKey: string
}

export type PebbleKind = 'task' | 'subtask'

interface TodayCounts {
  task: number
  subtask: number
}

/**
 * Returns today's task and subtask counts, but only if pebblesDate matches
 * today. Otherwise both are zero — the new day starts fresh.
 */
export function getTodayPebbles(p: Profile, today: string): TodayCounts {
  if (!p.pebblesDate || p.pebblesDate !== today) {
    return { task: 0, subtask: 0 }
  }
  return {
    task: p.todayTaskPebbles ?? 0,
    subtask: p.todaySubtaskPebbles ?? 0,
  }
}

/**
 * Increment today (for the given kind) and lifetime. On a new day, the
 * counters reset and pebblesDate advances. Lifetime only grows.
 */
export function incrementPebble(p: Profile, today: string, kind: PebbleKind): Profile {
  const isNewDay = p.pebblesDate !== today
  const baseTask = isNewDay ? 0 : (p.todayTaskPebbles ?? 0)
  const baseSub = isNewDay ? 0 : (p.todaySubtaskPebbles ?? 0)
  return {
    ...p,
    lifetimePebbles: (p.lifetimePebbles ?? 0) + 1,
    todayTaskPebbles: kind === 'task' ? baseTask + 1 : baseTask,
    todaySubtaskPebbles: kind === 'subtask' ? baseSub + 1 : baseSub,
    pebblesDate: today,
  }
}

/**
 * Decrement today (for the given kind), clamped at 0. Lifetime also
 * decrements — unchecking a completion removes its pebble from the
 * lifetime count so the surface stays accurate, not aspirational. Today's
 * counters only move if pebblesDate matches today; lifetime always moves
 * (a yesterday-completion being undone still removes the pebble).
 */
export function decrementPebble(p: Profile, today: string, kind: PebbleKind): Profile {
  const lifetimePebbles = Math.max(0, (p.lifetimePebbles ?? 0) - 1)
  if (p.pebblesDate !== today) {
    return { ...p, lifetimePebbles }
  }
  if (kind === 'task') {
    return {
      ...p,
      lifetimePebbles,
      todayTaskPebbles: Math.max(0, (p.todayTaskPebbles ?? 0) - 1),
    }
  }
  return {
    ...p,
    lifetimePebbles,
    todaySubtaskPebbles: Math.max(0, (p.todaySubtaskPebbles ?? 0) - 1),
  }
}

export const SEED_PROFILE: Profile = {
  name: 'Ying',
  avatar: { kind: 'preset', key: 'mochi' },
  density: 'comfortable',
  completionSound: true,
  completionAnimation: true,
  reduceMotion: false,
}

/** Hard caps applied at hydration. Defensive against malicious cloud writes. */
export const MAX_PROFILE_NAME_LEN = 64
export const MAX_PROFILE_QUOTE_LEN = 240
export const MAX_PROFILE_TITLE_LEN = 64
/**
 * Avatar URI cap. Base64 data URLs typically run ~50-200 KB after web
 * compression to 256px. Reject anything > 1 MB as a defense against bad
 * data — also keeps profile docs under Firestore's 1 MB doc limit.
 */
export const MAX_AVATAR_URI_LEN = 1_000_000

export interface PresetAvatar {
  key: string
  emoji: string
  bg: string
  /**
   * Optional bundled-image key. When set, Avatar components render a platform-
   * resolved image source (mobile: require'd asset; web: public URL) instead
   * of the emoji. The emoji is kept as a fallback for environments where the
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
 * Loud original presets (smile, rabbit, star, heart, sparkles, rocket) were
 * dropped — they read as high-energy / achievement-y. Users who selected a
 * dropped preset get migrated to a calmer equivalent in migrateAvatar.
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

/** Web's lucide-style icon avatars. Hex colors so they're cross-platform safe. */
export const AVATAR_ICON_LIBRARY: Avatar[] = [
  { kind: 'icon', icon: 'smile',     color: '#FF9500' },
  { kind: 'icon', icon: 'cat',       color: '#34C759' },
  { kind: 'icon', icon: 'dog',       color: '#007AFF' },
  { kind: 'icon', icon: 'bird',      color: '#30B0C7' },
  { kind: 'icon', icon: 'rabbit',    color: '#FF2D92' },
  { kind: 'icon', icon: 'fish',      color: '#007AFF' },
  { kind: 'icon', icon: 'star',      color: '#FFCC00' },
  { kind: 'icon', icon: 'heart',     color: '#FF3B30' },
  { kind: 'icon', icon: 'sparkles',  color: '#AF52DE' },
  { kind: 'icon', icon: 'rocket',    color: '#007AFF' },
  { kind: 'icon', icon: 'sun',       color: '#FF9500' },
]

/**
 * Themed collectable per preset — used by PebbleStrip to render the
 * day's check-offs as something cohesive with the user's avatar.
 * mochi (and any unlisted preset) keeps the default pebble visual,
 * so we return null for those and the caller renders its SVG
 * pebble fallback.
 */
const COLLECTED_GLYPHS: Record<string, string> = {
  cat: '🐟',
  dog: '🦴',
  bird: '🪶',
  fish: '🫧',
  butterfly: '🌸',
  owl: '📚',
  elephant: '🌱',
  whale: '💦',
  squirrel: '🌰',
  rabbit: '🥕',
}

export function collectedGlyphFor(avatar: Avatar | undefined): string | null {
  if (!avatar || avatar.kind !== 'preset') return null
  return COLLECTED_GLYPHS[avatar.key] ?? null
}

/**
 * Stable noun token per preset, used as the lifetime-count label
 * when themeFromAvatar is on. mochi (and any unmapped key) returns
 * null so the caller can fall back to the default "pebbles placed".
 * The token is resolved to a localized phrase by i18n.lifetimeLabel.
 */
const COLLECTED_NOUN_KEYS: Record<string, string> = {
  cat: 'fish',
  dog: 'bones',
  bird: 'feathers',
  fish: 'bubbles',
  butterfly: 'flowers',
  owl: 'books',
  elephant: 'grass',
  whale: 'spouts',
  squirrel: 'acorns',
  rabbit: 'carrots',
}

export function collectedNounKeyFor(avatar: Avatar | undefined): string | null {
  if (!avatar || avatar.kind !== 'preset') return null
  return COLLECTED_NOUN_KEYS[avatar.key] ?? null
}

export function findPreset(key: string): PresetAvatar {
  return AVATAR_PRESET_LIBRARY.find((a) => a.key === key) ?? AVATAR_PRESET_LIBRARY[0]
}

/**
 * Migration: web's original Avatar shape used `data` for image kind. Map it
 * to `uri` so cloud-stored avatars are interchangeable. All string fields
 * are length-capped to defend against malicious cloud pushes.
 */
export function migrateProfile(raw: unknown): Profile {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return SEED_PROFILE
  const p = raw as Record<string, unknown>
  if (typeof p.name !== 'string' || p.name.length === 0 || !p.avatar) return SEED_PROFILE
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
    density:
      p.density === 'compact'
        ? 'compact'
        : p.density === 'comfortable'
          ? 'comfortable'
          : undefined,
    title:
      typeof p.title === 'string' && p.title.length > 0
        ? p.title.slice(0, MAX_PROFILE_TITLE_LEN)
        : undefined,
    reduceMotion: typeof p.reduceMotion === 'boolean' ? p.reduceMotion : undefined,
    view: p.view === 'category' || p.view === 'status' ? p.view : undefined,
    statuses: migrateStatuses(p.statuses),
    priorities: migratePriorities(p.priorities),
    completionAnimation:
      typeof p.completionAnimation === 'boolean' ? p.completionAnimation : undefined,
    themeFromAvatar:
      typeof p.themeFromAvatar === 'boolean' ? p.themeFromAvatar : undefined,
    completionSound:
      typeof p.completionSound === 'boolean' ? p.completionSound : undefined,
    lifetimePebbles:
      typeof p.lifetimePebbles === 'number' && p.lifetimePebbles >= 0
        ? Math.floor(p.lifetimePebbles)
        : undefined,
    todayTaskPebbles:
      typeof p.todayTaskPebbles === 'number' && p.todayTaskPebbles >= 0
        ? Math.floor(p.todayTaskPebbles)
        : undefined,
    todaySubtaskPebbles:
      typeof p.todaySubtaskPebbles === 'number' && p.todaySubtaskPebbles >= 0
        ? Math.floor(p.todaySubtaskPebbles)
        : undefined,
    pebblesDate:
      typeof p.pebblesDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.pebblesDate)
        ? p.pebblesDate
        : undefined,
    onboardingDone: p.onboardingDone === true ? true : undefined,
    guidesSeen: Array.isArray(p.guidesSeen)
      ? p.guidesSeen.filter(
          (id: unknown): id is string =>
            typeof id === 'string' && id.length > 0 && id.length < 64,
        )
      : undefined,
    guidesPromptShown: p.guidesPromptShown === true ? true : undefined,
    dailyCheckinEnabled: p.dailyCheckinEnabled === true ? true : undefined,
    dailyCheckinHour:
      typeof p.dailyCheckinHour === 'number' &&
      p.dailyCheckinHour >= 0 &&
      p.dailyCheckinHour <= 23
        ? Math.floor(p.dailyCheckinHour)
        : undefined,
    pinnedFilters: migratePinnedFilters(p.pinnedFilters ?? p.pinnedFilter),
    homeStatTiles: migrateHomeStatTiles(p.homeStatTiles),
    background: migrateBackground(p.background),
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
    recurringV2: p.recurringV2 === true ? true : undefined,
  }
}

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

const MAX_BG_KEY_LEN = 48

function migrateBackground(raw: unknown): BackgroundChoice | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const b = raw as Record<string, unknown>
  if (typeof b.pattern !== 'string' || b.pattern.length === 0) return undefined
  if (typeof b.pairKey !== 'string' || b.pairKey.length === 0) return undefined
  return {
    pattern: b.pattern.slice(0, MAX_BG_KEY_LEN),
    pairKey: b.pairKey.slice(0, MAX_BG_KEY_LEN),
  }
}

/** Filter validator for the persisted `pinnedFilters` list. Accepts the
 * canonical system filters and `cat:<non-empty-id>`. Dedupes by first
 * occurrence and caps at 12 (sane upper bound — the FilterBar row would
 * scroll past viewport long before then). Falls back to a single-string
 * legacy value (the field used to be `pinnedFilter`) for backward compat. */
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
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (Array.isArray(item)) {
        // New shape: array of arrays.
        pushSet(item as unknown[] as string[])
      } else if (valid(item)) {
        // Legacy shape: flat array of filter strings. Wrap each as
        // a single-element set.
        pushSet([item])
      }
      if (sets.length >= 12) break
    }
  } else if (valid(raw)) {
    pushSet([raw])
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
    const uri = typeof a.uri === 'string' ? a.uri : typeof a.data === 'string' ? a.data : null
    if (!uri) return null
    if (uri.length > MAX_AVATAR_URI_LEN) return null
    return { kind: 'image', uri }
  }
  if (a.kind === 'icon' && typeof a.icon === 'string' && typeof a.color === 'string') {
    return { kind: 'icon', icon: a.icon.slice(0, 64), color: a.color.slice(0, 32) }
  }
  if (a.kind === 'preset' && typeof a.key === 'string') {
    const key = a.key.slice(0, 64)
    // Dropped-preset migration: the v1.2.x curation removed loud preset
    // keys. Map each to a calmer cousin so an existing user doesn't
    // silently flip to the global mochi fallback when their old choice
    // disappears.
    const mapped = DROPPED_PRESET_MIGRATIONS[key] ?? key
    return { kind: 'preset', key: mapped }
  }
  return null
}

const DROPPED_PRESET_MIGRATIONS: Record<string, string> = {
  // Original v1.2.x dropped loud presets.
  smile:    'cat',     // sun was the old fallback; sun is gone too, route warm presets to cat
  star:     'cat',     // ditto
  heart:    'rabbit',  // rose blush bg — closest warm/delicate cousin (flower was dropped in v1.5)
  sparkles: 'butterfly',
  rocket:   'bird',
  // v1.5 curation removed cloud/moon/sun/leaf/tree. Map each to a
  // calmer animal/object cousin so existing users don't silently flip
  // to the brand mochi fallback when they re-open the app.
  cloud: 'whale',     // both calm + blue/sea-tone
  moon:  'owl',       // nocturnal companions
  sun:   'cat',       // warm/contented vibe
  leaf:  'rabbit',    // soft nature pairing
  tree:  'squirrel',  // squirrel lives in tree
  // v1.5.x removed flower — route to butterfly (both gentle/floral).
  flower: 'butterfly',
}
