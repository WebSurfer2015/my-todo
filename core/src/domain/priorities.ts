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
