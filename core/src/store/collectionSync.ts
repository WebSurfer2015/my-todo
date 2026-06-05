import { CollectionAdapter, CollectionEntry } from '../ports/persistence'

/**
 * The brain of per-item persistence (docs/SPIKE-persistence-scale.md). A
 * slice still holds the whole array in memory; on each change we diff the
 * last-written snapshot against the desired one and emit the MINIMAL set of
 * per-doc writes — upsert changed/new ids, remove deleted ids — instead of
 * rewriting the whole array doc. That's the write-amplification fix.
 *
 * Pure except for the injected adapter calls, so it's unit-testable with an
 * in-memory CollectionAdapter. `prev`/`next` map id → serialized value
 * (the same {version,data} envelope, one item's worth).
 */
export async function syncCollection(
  adapter: CollectionAdapter,
  prev: ReadonlyMap<string, string>,
  next: ReadonlyMap<string, string>,
): Promise<{ upserted: string[]; removed: string[] }> {
  const upserted: string[] = []
  const removed: string[] = []
  for (const [id, value] of next) {
    if (prev.get(id) !== value) {
      await adapter.upsert(id, value)
      upserted.push(id)
    }
  }
  for (const id of prev.keys()) {
    if (!next.has(id)) {
      await adapter.remove(id)
      removed.push(id)
    }
  }
  return { upserted, removed }
}

/**
 * One-time forward-only backfill: copy every item from the single-doc array
 * into the per-item collection that isn't already there. NEVER deletes — the
 * single doc stays the source of truth until the flagged cutover, so a
 * backfill can run repeatedly (idempotent) during the dual-write phase.
 */
export async function backfillCollection(
  adapter: CollectionAdapter,
  items: readonly CollectionEntry[],
): Promise<string[]> {
  const existing = new Set((await adapter.getAll()).map((e) => e.id))
  const wrote: string[] = []
  for (const it of items) {
    if (!existing.has(it.id)) {
      await adapter.upsert(it.id, it.value)
      wrote.push(it.id)
    }
  }
  return wrote
}
