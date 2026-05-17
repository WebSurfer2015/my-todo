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

import type { ViewMode, StatusFilter } from './types'

export interface StatusOverride {
  id: StatusFilter
  /** User-set label override; falls back to t.filters[id]. */
  label?: string
  /** When true, this status is hidden from the filter row. */
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
  /** Show a calm completion animation when a task is marked done. Defaults to true. */
  completionAnimation?: boolean
  /** Play a sound when a task is marked done. Defaults to true. (Sound playback NYI.) */
  completionSound?: boolean
  /**
   * Pebbles — live progress indicator with two scopes:
   *
   * - `todayTaskPebbles` / `todaySubtaskPebbles` mirror today's actual
   *   completions. They go UP when a task/subtask is checked done and DOWN
   *   when it's un-checked (min 0). At local midnight (pebblesDate change)
   *   both reset to 0.
   *
   * - `lifetimePebbles` is cumulative and monotonic. Trashing or undoing a
   *   task does not lower it — it represents "every check-off you've ever
   *   completed, since you started." Shown on the Profile sheet.
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
   */
  pinnedFilters?: string[]
  /**
   * App background choice — pairs a pattern key (e.g. 'solid', 'gradient',
   * 'blob') with a color-pair key (e.g. 'cream', 'mochi-shell'). Rendering
   * lives in the mobile workspace; core stores raw strings and lets the
   * renderer fall back to the default when a key is unknown. Missing field
   * = the default cream-solid look (zero diff from v1.0.x).
   */
  background?: BackgroundChoice
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
 * Decrement today (for the given kind), clamped at 0. Lifetime is unchanged
 * — historical completions stay on the record even when something is undone.
 * If the user undoes a task completed yesterday, today's counters don't move
 * (pebblesDate mismatch).
 */
export function decrementPebble(p: Profile, today: string, kind: PebbleKind): Profile {
  if (p.pebblesDate !== today) return p
  if (kind === 'task') {
    return { ...p, todayTaskPebbles: Math.max(0, (p.todayTaskPebbles ?? 0) - 1) }
  }
  return { ...p, todaySubtaskPebbles: Math.max(0, (p.todaySubtaskPebbles ?? 0) - 1) }
}

export const SEED_PROFILE: Profile = {
  name: 'Ying',
  avatar: { kind: 'preset', key: 'mochi' },
  density: 'comfortable',
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

/** Cross-platform emoji preset library. Stable keys so cross-device sync works. */
export const AVATAR_PRESET_LIBRARY: PresetAvatar[] = [
  { key: 'mochi',    emoji: '🐢', bg: '#E8F0E5', imageKey: 'mochi' },  // Mochi illustration (brand mascot) — emoji is fallback only
  { key: 'smile',    emoji: '😀', bg: '#FF9500' },
  { key: 'cat',      emoji: '🐱', bg: '#34C759' },
  { key: 'dog',      emoji: '🐶', bg: '#007AFF' },
  { key: 'bird',     emoji: '🐦', bg: '#30B0C7' },
  { key: 'rabbit',   emoji: '🐰', bg: '#FF2D92' },
  { key: 'fish',     emoji: '🐠', bg: '#5856D6' },
  { key: 'star',     emoji: '⭐', bg: '#FFCC00' },
  { key: 'heart',    emoji: '❤️', bg: '#FF3B30' },
  { key: 'sparkles', emoji: '✨', bg: '#AF52DE' },
  { key: 'rocket',   emoji: '🚀', bg: '#0A84FF' },
  { key: 'flower',   emoji: '🌸', bg: '#FF2D92' },
  { key: 'sun',      emoji: '☀️', bg: '#FF9500' },
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
  { kind: 'icon', icon: 'flower',    color: '#FF2D92' },
  { kind: 'icon', icon: 'sun',       color: '#FF9500' },
]

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
    reduceMotion: p.reduceMotion === true ? true : undefined,
    view: p.view === 'category' || p.view === 'status' ? p.view : undefined,
    statuses: migrateStatuses(p.statuses),
    completionAnimation: p.completionAnimation === false ? false : undefined,
    completionSound: p.completionSound === false ? false : undefined,
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
    dailyCheckinEnabled: p.dailyCheckinEnabled === true ? true : undefined,
    dailyCheckinHour:
      typeof p.dailyCheckinHour === 'number' &&
      p.dailyCheckinHour >= 0 &&
      p.dailyCheckinHour <= 23
        ? Math.floor(p.dailyCheckinHour)
        : undefined,
    pinnedFilters: migratePinnedFilters(p.pinnedFilters ?? p.pinnedFilter),
    background: migrateBackground(p.background),
  }
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
function migratePinnedFilters(raw: unknown): string[] | undefined {
  const valid = (s: unknown): s is string => {
    if (typeof s !== 'string' || s.length === 0) return false
    if (s === 'all' || s === 'open' || s === 'overdue' || s === 'done' || s === 'trash') {
      return true
    }
    return s.startsWith('cat:') && s.length > 4 && s.length <= 200
  }
  const items: string[] = []
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (valid(item) && !items.includes(item)) items.push(item)
      if (items.length >= 12) break
    }
  } else if (valid(raw)) {
    items.push(raw)
  }
  return items.length > 0 ? items : undefined
}

const VALID_STATUS_IDS: StatusFilter[] = ['overdue', 'open', 'done', 'trash']
const MAX_STATUS_LABEL_LEN = 40

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
    return { kind: 'preset', key: a.key.slice(0, 64) }
  }
  return null
}
