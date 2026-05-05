import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  onSnapshot,
} from "@react-native-firebase/firestore";
import type { Firestore } from "@react-native-firebase/firestore";
import { StorageAdapter, stateDocPath } from "../../core/src/persistence";

/**
 * Firestore-backed StorageAdapter for React Native. Stores each persisted
 * entity at users/{uid}/state/{key} as { value: string, updatedAt: number },
 * where `value` is the same JSON envelope core's writeVersioned writes to
 * AsyncStorage — so the data shape matches web exactly.
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
      const data = snap.data() as { value?: string } | undefined;
      return data?.value ?? null;
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
      // No-op — clearing requires enumerating subcollections.
    },
    subscribe(key, callback) {
      const ref = doc(db, stateDocPath(uid, key));
      return onSnapshot(ref, (snap) => {
        if (!snap.exists()) return callback(null);
        const data = snap.data() as { value?: string } | undefined;
        callback(data?.value ?? null);
      });
    },
  };
}
