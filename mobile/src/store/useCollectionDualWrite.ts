import { useEffect, useRef } from "react";
import { CollectionAdapter } from "../../../core/src/ports/persistence";
import { syncCollection } from "../../../core/src/store/collectionSync";

/**
 * Phase-3 DUAL-WRITE (docs/SPIKE-persistence-scale.md). Mirrors an
 * in-memory array into a per-item CollectionAdapter, IN ADDITION to the
 * existing single-doc write that useSyncedState already performs. Reads stay
 * on the single doc — this only POPULATES the per-item collection so a later
 * read-cutover has live data. Zero behavior change while `enabled` is off.
 *
 * Reversible by design:
 *   - `enabled` is the default-off kill-switch (TODOS_PER_DOC_DUAL_WRITE).
 *     Off → the hook never touches the collection.
 *   - Single doc remains the source of truth; nothing here reads from the
 *     collection, so flipping the flag off again loses nothing.
 *
 * Debounced (~400ms) to match useSyncedState so a burst of edits collapses
 * into the MINIMAL per-item upserts/removes (the write-amplification fix),
 * computed by core's `syncCollection` against the last-written snapshot.
 *
 * The diff baseline resets whenever the adapter identity changes (uid swap /
 * sign-out) so we never diff against another account's snapshot.
 */
export function useCollectionDualWrite<T>(
  adapter: CollectionAdapter | null,
  items: T[],
  loaded: boolean,
  enabled: boolean,
  toId: (item: T) => string,
  toValue: (item: T) => string,
): void {
  // id -> serialized value of the last set we wrote, so we emit only deltas.
  const prevRef = useRef<Map<string, string>>(new Map());
  const toIdRef = useRef(toId);
  const toValueRef = useRef(toValue);
  toIdRef.current = toId;
  toValueRef.current = toValue;

  // New backend (sign-in/out, uid rotation) → drop the stale baseline so the
  // first sync re-derives the full delta against the new collection.
  useEffect(() => {
    prevRef.current = new Map();
  }, [adapter]);

  useEffect(() => {
    if (!enabled || !adapter || !loaded) return;
    const next = new Map<string, string>();
    for (const it of items) next.set(toIdRef.current(it), toValueRef.current(it));

    // Cheap pre-check: skip scheduling a write when nothing changed.
    const prev = prevRef.current;
    let changed = next.size !== prev.size;
    if (!changed) {
      for (const [id, v] of next) {
        if (prev.get(id) !== v) {
          changed = true;
          break;
        }
      }
    }
    if (!changed) return;

    const handle = setTimeout(() => {
      const baseline = prevRef.current;
      // Optimistically advance the baseline so an immediate re-render doesn't
      // re-diff the same set; roll back on failure to retry next change.
      prevRef.current = next;
      syncCollection(adapter, baseline, next).catch((err) => {
        prevRef.current = baseline;
        console.warn("useCollectionDualWrite sync failed:", err);
      });
    }, 400);
    return () => clearTimeout(handle);
  }, [adapter, items, loaded, enabled]);
}
