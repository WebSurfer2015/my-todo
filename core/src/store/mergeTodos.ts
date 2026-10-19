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
 */
import type { Todo } from '../domain/types'

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
  return out
}
