import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  CollectionAdapter,
  CollectionEntry,
} from "../../../core/src/ports/persistence";

/**
 * Per-ITEM AsyncStorage adapter — the SIGNED-OUT mirror of
 * makeFirestoreCollectionAdapter (docs/SPIKE-persistence-scale.md, option
 * B). Each item is one AsyncStorage entry keyed `${name}/${id}`, holding the
 * same {version,data} envelope (one item's worth) the single-doc model
 * stores, so the migrators are reused unchanged.
 *
 * No `subscribe` — AsyncStorage is a plain KV store with no realtime feed,
 * exactly like the single-doc local adapter; the store falls back to
 * one-shot reads on hydration.
 *
 * The `${name}/` prefix can't collide with the single-doc keys: those are
 * bare (`todos`, `groceries`) with no trailing slash, so the prefix scan
 * skips them. Wired only behind the default-off dual-write flag — see
 * useCollectionDualWrite.
 */
export function makeLocalCollectionAdapter(name: string): CollectionAdapter {
  const prefix = `${name}/`;
  return {
    async getAll() {
      const keys = (await AsyncStorage.getAllKeys()).filter((k) =>
        k.startsWith(prefix),
      );
      const pairs = await AsyncStorage.multiGet(keys);
      const out: CollectionEntry[] = [];
      for (const [k, v] of pairs) {
        if (typeof v === "string") out.push({ id: k.slice(prefix.length), value: v });
      }
      return out;
    },
    async upsert(id, value) {
      await AsyncStorage.setItem(prefix + id, value);
    },
    async remove(id) {
      await AsyncStorage.removeItem(prefix + id);
    },
  };
}
