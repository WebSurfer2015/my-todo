import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  onSnapshot,
  Firestore,
} from "firebase/firestore";
import { StorageAdapter, stateDocPath } from "../../../core/src/ports/persistence";

/**
 * Firestore-backed StorageAdapter. Each persisted entity (todos, categories,
 * profile) is stored as a single doc at users/{uid}/state/{key} with a
 * { value: string, updatedAt: number } shape. The `value` is the same JSON
 * envelope that core's writeVersioned would write to localStorage, so the
 * data shape is identical and the same migrate functions handle reads.
 */
export function makeFirestoreAdapter(
  db: Firestore,
  uid: string,
): StorageAdapter {
  return {
    async getItem(key) {
      const ref = doc(db, stateDocPath(uid, key));
      const snap = await getDoc(ref);
      if (!snap.exists()) return null;
      const data = snap.data() as { value?: string };
      return data.value ?? null;
    },
    async setItem(key, value) {
      const ref = doc(db, stateDocPath(uid, key));
      await setDoc(ref, { value, updatedAt: Date.now() });
    },
    async removeItem(key) {
      const ref = doc(db, stateDocPath(uid, key));
      await deleteDoc(ref);
    },
    async clear() {
      // No-op for now: clearing requires enumerating subcollections, which is
      // expensive. Sign-out clears local state via the React tree unmount.
    },
    subscribe(key, callback) {
      const ref = doc(db, stateDocPath(uid, key));
      return onSnapshot(
        ref,
        (snap) => {
          // Skip snapshots that fire while a local write is still pending —
          // the SDK may serve a pre-write cache value here, which would
          // clobber the user's just-applied optimistic update with stale
          // data (the cause of "picked date reverts to parent date" bug).
          if (snap.metadata.hasPendingWrites) return;
          if (!snap.exists()) return callback(null);
          const data = snap.data() as { value?: string };
          callback(data.value ?? null);
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
