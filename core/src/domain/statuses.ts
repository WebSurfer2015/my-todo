import { StatusFilter, STATUS_FILTERS } from './types'
import { Profile, StatusOverride } from '../data/profile'
import type { Strings } from '../data/i18n'

export interface StatusEntry {
  id: StatusFilter
  label: string
}

/** Return all statuses in user-defined order, with resolved labels. Defaults fill any missing ids. */
export function getOrderedStatuses(profile: Profile, t: Strings): StatusEntry[] {
  const overrides = profile.statuses ?? []
  const seen = new Set<StatusFilter>()
  const result: StatusEntry[] = []
  for (const o of overrides) {
    if (seen.has(o.id)) continue
    seen.add(o.id)
    result.push({
      id: o.id,
      label: o.label && o.label.trim() ? o.label : t.filters[o.id],
    })
  }
  for (const id of STATUS_FILTERS) {
    if (seen.has(id)) continue
    result.push({ id, label: t.filters[id] })
  }
  return result
}

/** Pure: produce a new statuses[] with the given override applied. */
function setOverride(
  profile: Profile,
  id: StatusFilter,
  patch: Partial<Omit<StatusOverride, 'id'>>,
): StatusOverride[] {
  const existing = profile.statuses ?? []
  const idx = existing.findIndex((s) => s.id === id)
  if (idx >= 0) {
    const next = [...existing]
    const merged = { ...existing[idx], ...patch }
    next[idx] = {
      id: merged.id,
      label: merged.label && merged.label.trim() ? merged.label : undefined,
    }
    return next
  }
  return [
    ...existing,
    {
      id,
      label: patch.label && patch.label.trim() ? patch.label : undefined,
    },
  ]
}

/** Pure: produce a new Profile with the status label renamed. Empty string clears the override. */
export function statusRename(profile: Profile, id: StatusFilter, label: string): Profile {
  return { ...profile, statuses: setOverride(profile, id, { label: label.trim() }) }
}

/**
 * Pure: produce a new Profile with statuses[] in a new order. The user passes the
 * full ordered list (e.g. as it appears in the sheet) so we don't have to recover
 * order from a partial overrides array.
 */
export function statusReorder(
  profile: Profile,
  newOrder: StatusFilter[],
): Profile {
  const existingMap = new Map<StatusFilter, StatusOverride>()
  for (const o of profile.statuses ?? []) existingMap.set(o.id, o)
  const seen = new Set<StatusFilter>()
  const next: StatusOverride[] = []
  for (const id of newOrder) {
    if (seen.has(id)) continue
    seen.add(id)
    const existing = existingMap.get(id)
    next.push({ id, label: existing?.label })
  }
  // Append any statuses missing from newOrder so we don't silently drop them.
  for (const id of STATUS_FILTERS) {
    if (!seen.has(id)) {
      const existing = existingMap.get(id)
      next.push({ id, label: existing?.label })
    }
  }
  return { ...profile, statuses: next }
}
