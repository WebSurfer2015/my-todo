import {
  CollectionAdapter,
  CollectionEntry,
} from "../../../core/src/ports/persistence";

/**
 * Per-ITEM localStorage adapter — the SIGNED-OUT mirror of
 * makeFirestoreCollectionAdapter (docs/SPIKE-persistence-scale.md, option
 * B). Each item is one localStorage entry keyed `${name}/${id}`, holding the
 * same {version,data} envelope (one item's worth) the single-doc model
 * stores, so the migrators are reused unchanged.
 *
 * No `subscribe` — localStorage has no per-key realtime feed in-tab, exactly
 * like the single-doc local adapter; the store falls back to one-shot reads
 * on hydration.
 *
 * The `${name}/` prefix can't collide with the single-doc keys: those are
 * bare (`todos`, `categories`) with no trailing slash, so the prefix scan
 * skips them. Wired only behind the default-off dual-write flag.
 */
export function makeLocalCollectionAdapter(name: string): CollectionAdapter {
  const prefix = `${name}/`;
  return {
    async getAll() {
      const out: CollectionEntry[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith(prefix)) continue;
        const v = localStorage.getItem(k);
        if (typeof v === "string") out.push({ id: k.slice(prefix.length), value: v });
      }
      return out;
    },
    async upsert(id, value) {
      localStorage.setItem(prefix + id, value);
    },
    async remove(id) {
      localStorage.removeItem(prefix + id);
    },
  };
}
