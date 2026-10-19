/**
 * Three-way merge of the `todos` list for multi-device sync.
 *
 * The whole list lives in ONE cloud doc, so a remote snapshot that arrives
 * while this device still has an unsaved local change would otherwise be
 * last-writer-wins on the entire list: either the remote replaces the local
 * edit, or the local write (moments later) erases the other device's edit.
 * Instead the shell merges per to-do:
 *
 * - present on both sides → the newer `updatedAt` wins (a tie keeps the
 *   remote copy, which the server already accepted);
 * - only on one side and NOT in `base` → added there since the last common
 *   state → kept;
 * - only on one side but in `base` → deleted on the other side. Kept only
 *   when this side edited it after `base` (an edit newer than the delete);
 *   otherwise the delete wins.
 *
 * `base` is the last state both sides agreed on (the last value this device
 * read or wrote). With no base every id counts as an addition, i.e. a plain
 * union — nothing is lost.
 *
 * Order follows `local` (so the user's list doesn't jump under them), with
 * remote-only rows appended. Pure: no clock, no ids, inputs untouched.
 *
 * Finally, two OPEN occurrences of the same series on the same day MAY be one
 * occurrence generated twice (two devices topped the series up before
 * syncing). A copy is dropped only when it is provably such an artifact: not
 * in `base` (generated since the last sync), not detached, and still on the
 * day its deterministic id names (isGeneratedSeriesRow — never a row the
 * user moved there). A row in `base` is never dropped: snooze / reschedule /
 * Mochi can legitimately put two real occurrences on one day. Among droppable
 * copies with no protected row on the day, the one in `remote` survives so the
 * list converges instead of stacking.
 */
import type { Todo, TodoReference } from '../domain/types'
import { dueDateOnly } from '../logic/utils'
import { isGeneratedSeriesRow, MAX_TODO_REFERENCES } from '../logic/derive'

const stamp = (td: Todo): number => td.updatedAt ?? 0

/** A row present on only one side survives unless the other side deleted
 * it and this side has no edit newer than `base`. */
function keepOneSided(row: Todo, baseById: Map<string, Todo>): boolean {
  const b = baseById.get(row.id)
  if (!b) return true
  return stamp(row) > stamp(b)
}

export function mergeTodos(
  base: readonly Todo[] | null,
  local: readonly Todo[],
  remote: readonly Todo[],
): Todo[] {
  const baseById = new Map((base ?? []).map((td) => [td.id, td]))
  const remoteById = new Map(remote.map((td) => [td.id, td]))
  const localIds = new Set(local.map((td) => td.id))
  const out: Todo[] = []
  for (const l of local) {
    const r = remoteById.get(l.id)
    if (r) out.push(stamp(l) > stamp(r) ? l : r)
    else if (keepOneSided(l, baseById)) out.push(l)
  }
  for (const r of remote) {
    if (localIds.has(r.id)) continue
    if (keepOneSided(r, baseById)) out.push(r)
  }
  return dedupeSeriesDays(out, baseById, remoteById)
}

/** Collapse duplicate generated copies of one open occurrence per
 * (seriesId, day) — see the header. Returns `rows` itself when there is
 * nothing to drop. */
function dedupeSeriesDays(
  rows: Todo[],
  baseById: Map<string, Todo>,
  remoteById: Map<string, Todo>,
): Todo[] {
  const groups = new Map<string, Todo[]>()
  for (const td of rows) {
    if (!td.seriesId || td.trashed || td.done) continue
    const day = dueDateOnly(td.dueDate)
    if (!day) continue
    const key = `${td.seriesId}|${day}`
    const g = groups.get(key)
    if (g) g.push(td)
    else groups.set(key, [td])
  }
  const drop = new Set<string>()
  const droppable = (td: Todo) =>
    !baseById.has(td.id) && !td.detachedFromSeries && isGeneratedSeriesRow(td)
  for (const g of groups.values()) {
    if (g.length < 2) continue
    const copies = g.filter(droppable)
    if (copies.length === 0) continue
    // A protected (real) row on the day absorbs every copy; else keep one
    // copy — the remote's when there is one.
    const keeper = copies.length < g.length
      ? undefined
      : copies.find((td) => remoteById.has(td.id)) ?? copies[0]
    for (const td of copies) if (td !== keeper) drop.add(td.id)
  }
  if (drop.size === 0) return rows
  return rows.filter((td) => !drop.has(td.id))
}

/**
 * Three-way merge of the suggestion history (`todoReferences`, one cloud doc)
 * — same rules as mergeTodos, keyed by `textLower` and stamped by
 * `lastSeenAt`: on both sides the newer wins; one-sided and not in `base` →
 * added there, kept; one-sided but in `base` → forgotten on the other side,
 * kept only when this side used it since. Newest first, capped at
 * MAX_TODO_REFERENCES. Pure.
 */
export function mergeTodoReferences(
  base: readonly TodoReference[] | null,
  local: readonly TodoReference[],
  remote: readonly TodoReference[],
): TodoReference[] {
  const baseBy = new Map((base ?? []).map((r) => [r.textLower, r]))
  const remoteBy = new Map(remote.map((r) => [r.textLower, r]))
  const localKeys = new Set(local.map((r) => r.textLower))
  const keep = (r: TodoReference) => {
    const b = baseBy.get(r.textLower)
    return !b || r.lastSeenAt > b.lastSeenAt
  }
  const out: TodoReference[] = []
  for (const l of local) {
    const r = remoteBy.get(l.textLower)
    if (r) out.push(l.lastSeenAt > r.lastSeenAt ? l : r)
    else if (keep(l)) out.push(l)
  }
  for (const r of remote) if (!localKeys.has(r.textLower) && keep(r)) out.push(r)
  return out.sort((a, b) => b.lastSeenAt - a.lastSeenAt).slice(0, MAX_TODO_REFERENCES)
}
