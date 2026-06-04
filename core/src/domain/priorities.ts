import { Priority, PRIORITY_VALUES } from './types'
import { Profile, PriorityOverride } from '../data/profile'
import type { Strings } from '../data/i18n'

export interface PriorityEntry {
  id: Priority
  label: string
  hidden: boolean
}

/** Return all priorities in user-defined order. Defaults fill any missing ids. */
export function getOrderedPriorities(profile: Profile, t: Strings): PriorityEntry[] {
  const overrides = profile.priorities ?? []
  const seen = new Set<Priority>()
  const result: PriorityEntry[] = []
  for (const o of overrides) {
    if (seen.has(o.id)) continue
    seen.add(o.id)
    result.push({
      id: o.id,
      label: t.priority[o.id],
      hidden: !!o.hidden,
    })
  }
  for (const id of PRIORITY_VALUES) {
    if (seen.has(id)) continue
    result.push({ id, label: t.priority[id], hidden: false })
  }
  return result
}

/** Same as getOrderedPriorities, but excluding hidden entries. */
export function getOrderedVisiblePriorities(profile: Profile, t: Strings): PriorityEntry[] {
  return getOrderedPriorities(profile, t).filter((p) => !p.hidden)
}

function setPriorityOverride(
  profile: Profile,
  id: Priority,
  patch: Partial<Omit<PriorityOverride, 'id'>>,
): PriorityOverride[] {
  const existing = profile.priorities ?? []
  const idx = existing.findIndex((p) => p.id === id)
  if (idx >= 0) {
    const next = [...existing]
    const merged = { ...existing[idx], ...patch }
    next[idx] = {
      id: merged.id,
      hidden: merged.hidden === true ? true : undefined,
    }
    return next
  }
  return [
    ...existing,
    { id, hidden: patch.hidden === true ? true : undefined },
  ]
}

/** Pure: produce a new Profile with the priority's hidden flag toggled. */
export function priorityToggleHidden(profile: Profile, id: Priority): Profile {
  const current = profile.priorities?.find((p) => p.id === id)
  const nextHidden = !current?.hidden
  return { ...profile, priorities: setPriorityOverride(profile, id, { hidden: nextHidden }) }
}

/** Pure: produce a new Profile with priorities[] in a new order. */
export function priorityReorder(profile: Profile, newOrder: Priority[]): Profile {
  const existingMap = new Map<Priority, PriorityOverride>()
  for (const o of profile.priorities ?? []) existingMap.set(o.id, o)
  const seen = new Set<Priority>()
  const next: PriorityOverride[] = []
  for (const id of newOrder) {
    if (seen.has(id)) continue
    seen.add(id)
    const existing = existingMap.get(id)
    next.push({ id, hidden: existing?.hidden })
  }
  for (const id of PRIORITY_VALUES) {
    if (!seen.has(id)) {
      const existing = existingMap.get(id)
      next.push({ id, hidden: existing?.hidden })
    }
  }
  return { ...profile, priorities: next }
}
