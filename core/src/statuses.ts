import { StatusFilter, STATUS_FILTERS } from './types'
import { Profile, StatusOverride } from './profile'
import type { Strings } from './i18n'

export interface StatusEntry {
  id: StatusFilter
  label: string
  hidden: boolean
}

/** Resolve a status's display label — user override if set, else the i18n default. */
export function getStatusLabel(id: StatusFilter, profile: Profile, t: Strings): string {
  const override = profile.statuses?.find((s) => s.id === id)
  if (override?.label && override.label.trim()) return override.label
  return t.filters[id]
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
      hidden: !!o.hidden,
    })
  }
  for (const id of STATUS_FILTERS) {
    if (seen.has(id)) continue
    result.push({ id, label: t.filters[id], hidden: false })
  }
  return result
}

/** Same as getOrderedStatuses, but excluding hidden entries. */
export function getOrderedVisibleStatuses(profile: Profile, t: Strings): StatusEntry[] {
  return getOrderedStatuses(profile, t).filter((s) => !s.hidden)
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
      hidden: merged.hidden === true ? true : undefined,
    }
    return next
  }
  return [
    ...existing,
    {
      id,
      label: patch.label && patch.label.trim() ? patch.label : undefined,
      hidden: patch.hidden === true ? true : undefined,
    },
  ]
}

/** Pure: produce a new Profile with the status label renamed. Empty string clears the override. */
export function statusRename(profile: Profile, id: StatusFilter, label: string): Profile {
  return { ...profile, statuses: setOverride(profile, id, { label: label.trim() }) }
}

/** Pure: produce a new Profile with the status' hidden flag toggled. */
export function statusToggleHidden(profile: Profile, id: StatusFilter): Profile {
  const current = profile.statuses?.find((s) => s.id === id)
  const nextHidden = !current?.hidden
  return { ...profile, statuses: setOverride(profile, id, { hidden: nextHidden }) }
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
    next.push({
      id,
      label: existing?.label,
      hidden: existing?.hidden,
    })
  }
  // Append any statuses missing from newOrder so we don't silently drop them.
  for (const id of STATUS_FILTERS) {
    if (!seen.has(id)) {
      const existing = existingMap.get(id)
      next.push({ id, label: existing?.label, hidden: existing?.hidden })
    }
  }
  return { ...profile, statuses: next }
}
