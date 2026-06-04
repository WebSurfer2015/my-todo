import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  onSnapshot,
} from "@react-native-firebase/firestore";
import type { FirebaseFirestoreTypes } from "@react-native-firebase/firestore";

type Firestore = FirebaseFirestoreTypes.Module;
import { StorageAdapter, stateDocPath } from "../../../core/src/ports/persistence";

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
        // Skip snapshots that fire while a local write is still pending —
        // the SDK may serve a pre-write cache value here, which would
        // clobber the user's just-applied optimistic update with stale
        // data. This was the root cause of intermittent "checkbox toggle
        // doesn't stick" / "subtask date reverts" reports. Web's adapter
        // got this fix in c349374; mobile's was missed and inherited the
        // bug. Once the server confirms the write, the next snapshot
        // fires with hasPendingWrites=false and matches lastSerializedRef,
        // so subscribe stays a no-op for our own echoes. Cross-device
        // updates from other clients still come through normally.
        if (snap.metadata.hasPendingWrites) return;
        if (!snap.exists()) return callback(null);
        const data = snap.data() as { value?: string } | undefined;
        callback(data?.value ?? null);
      });
    },
  };
}
