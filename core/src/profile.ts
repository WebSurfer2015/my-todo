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

export interface Profile {
  name: string
  quote?: string
  avatar: Avatar
  density?: Density
  title?: string
}

export const SEED_PROFILE: Profile = {
  name: 'Ying',
  avatar: { kind: 'preset', key: 'smile' },
  density: 'comfortable',
}

export interface PresetAvatar {
  key: string
  emoji: string
  bg: string
}

/** Cross-platform emoji preset library. Stable keys so cross-device sync works. */
export const AVATAR_PRESET_LIBRARY: PresetAvatar[] = [
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
 * to `uri` so cloud-stored avatars are interchangeable.
 */
export function migrateProfile(raw: unknown): Profile {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return SEED_PROFILE
  const p = raw as Record<string, unknown>
  if (!p.name || !p.avatar) return SEED_PROFILE
  const avatar = migrateAvatar(p.avatar)
  if (!avatar) return SEED_PROFILE
  return {
    name: String(p.name),
    quote: typeof p.quote === 'string' ? p.quote : undefined,
    avatar,
    density: p.density === 'compact' ? 'compact' : p.density === 'comfortable' ? 'comfortable' : undefined,
    title: typeof p.title === 'string' ? p.title : undefined,
  }
}

function migrateAvatar(raw: unknown): Avatar | null {
  if (!raw || typeof raw !== 'object') return null
  const a = raw as Record<string, unknown>
  if (a.kind === 'image') {
    const uri = typeof a.uri === 'string' ? a.uri : typeof a.data === 'string' ? a.data : null
    if (!uri) return null
    return { kind: 'image', uri }
  }
  if (a.kind === 'icon' && typeof a.icon === 'string' && typeof a.color === 'string') {
    return { kind: 'icon', icon: a.icon, color: a.color }
  }
  if (a.kind === 'preset' && typeof a.key === 'string') {
    return { kind: 'preset', key: a.key }
  }
  return null
}
