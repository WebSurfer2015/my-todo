import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot,
  Firestore,
} from "firebase/firestore";
import {
  CollectionAdapter,
  CollectionEntry,
  itemCollectionPath,
} from "../../../core/src/ports/persistence";

/**
 * Per-ITEM Firestore adapter — one document per todo/grocery under
 * users/{uid}/{name}/{itemId}, vs the single-doc `makeFirestoreAdapter`.
 * The scale path from docs/SPIKE-persistence-scale.md (option B): edits
 * write one small doc and conflict resolution is per-item.
 *
 * Each doc reuses the existing { value, updatedAt } envelope (value = the
 * same {version,data} JSON the single-doc model stores, one item's worth),
 * so the migrators and the Firestore rules shape check are reused as-is.
 *
 * NOT yet wired into the store — this is Phase 1 (additive + tested) of the
 * phased migration. The store keeps using the single-doc adapter until the
 * dual-write/cutover phases.
 */
export function makeFirestoreCollectionAdapter(
  db: Firestore,
  uid: string,
  name: string,
): CollectionAdapter {
  const path = itemCollectionPath(uid, name);

  const readSnap = (
    snap: { forEach: (cb: (d: { id: string; data: () => unknown }) => void) => void },
  ): CollectionEntry[] => {
    const out: CollectionEntry[] = [];
    snap.forEach((d) => {
      const v = (d.data() as { value?: string }).value;
      if (typeof v === "string") out.push({ id: d.id, value: v });
    });
    return out;
  };

  return {
    async getAll() {
      return readSnap(await getDocs(collection(db, path)));
    },
    async upsert(id, value) {
      await setDoc(doc(db, path, id), { value, updatedAt: Date.now() });
    },
    async remove(id) {
      await deleteDoc(doc(db, path, id));
    },
    subscribe(callback) {
      return onSnapshot(collection(db, path), (snap) => {
        // Skip our own optimistic writes (pre-commit cache snapshots) —
        // same echo-guard as the single-doc adapter, so a local write
        // doesn't round-trip and clobber newer in-memory state.
        if (snap.metadata.hasPendingWrites) return;
        callback(readSnap(snap));
      });
    },
  };
}
