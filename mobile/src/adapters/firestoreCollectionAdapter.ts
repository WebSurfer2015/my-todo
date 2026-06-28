import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot,
} from "@react-native-firebase/firestore";
import type { FirebaseFirestoreTypes } from "@react-native-firebase/firestore";

type Firestore = FirebaseFirestoreTypes.Module;
import {
  CollectionAdapter,
  CollectionEntry,
  itemCollectionPath,
} from "../../../core/src/ports/persistence";

/**
 * Per-ITEM Firestore adapter for React Native — one doc per todo/grocery at
 * users/{uid}/{name}/{itemId}, the scale path from
 * docs/SPIKE-persistence-scale.md (option B). Mirrors web's
 * makeFirestoreCollectionAdapter; reuses the { value, updatedAt } envelope
 * + the hasPendingWrites echo-guard from the single-doc adapter.
 *
 * NOT yet wired into the mobile store — additive Phase-1 infra. Cutover is
 * the flagged dual-write phase.
 */
export function makeFirestoreCollectionAdapter(
  db: Firestore,
  uid: string,
  name: string,
): CollectionAdapter {
  const path = itemCollectionPath(uid, name);

  const read = (snap: FirebaseFirestoreTypes.QuerySnapshot): CollectionEntry[] => {
    const out: CollectionEntry[] = [];
    snap.forEach((d) => {
      const v = (d.data() as { value?: string } | undefined)?.value;
      if (typeof v === "string") out.push({ id: d.id, value: v });
    });
    return out;
  };

  return {
    async getAll() {
      return read(await getDocs(collection(db, path)));
    },
    async upsert(id, value) {
      await setDoc(doc(db, path, id), { value, updatedAt: Date.now() });
    },
    async remove(id) {
      await deleteDoc(doc(db, path, id));
    },
    subscribe(callback) {
      return onSnapshot(
        collection(db, path),
        (snap) => {
          if (snap.metadata.hasPendingWrites) return;
          callback(read(snap));
        },
        (err) => {
          // permission-denied is expected during the sign-out / uid-swap
          // teardown window — the listener can outlive auth for a tick.
          // Stay quiet on it; surface anything else.
          const code = (err as { code?: string }).code ?? "";
          if (code.includes("permission-denied")) return;
          console.warn("Firestore subscribe error:", err);
        },
      );
    },
  };
}
