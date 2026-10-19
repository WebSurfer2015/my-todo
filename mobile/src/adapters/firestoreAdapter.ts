import {
  doc,
  getDoc,
  getDocFromCache,
  setDoc,
  deleteDoc,
  onSnapshot,
} from "@react-native-firebase/firestore";
import type { FirebaseFirestoreTypes } from "@react-native-firebase/firestore";

type Firestore = FirebaseFirestoreTypes.Module;
import { StorageAdapter, stateDocPath } from "../../../core/src/ports/persistence";

/** Delay before the one retry of a listener that failed permission-denied. */
export const SUBSCRIBE_RETRY_MS = 1500;

function valueOf(snap: FirebaseFirestoreTypes.DocumentSnapshot): string | null {
  const data = snap.data() as { value?: string } | undefined;
  return data?.value ?? null;
}

/**
 * Firestore-backed StorageAdapter for React Native. Stores each persisted
 * entity at users/{uid}/state/{key} as { value: string, updatedAt: number },
 * where `value` is the same `{version, data}` JSON envelope core's
 * writeVersioned produces.
 */
export function makeFirestoreAdapter(
  db: Firestore,
  uid: string,
): StorageAdapter {
  return {
    async getItem(key) {
      const ref = doc(db, stateDocPath(uid, key));
      // Cache first: a warm offline cache answers in ms, so a cold start on a
      // bad network doesn't wait on the server (the live listener brings any
      // newer server copy right after). A cached doc is real data — it
      // counts as a trusted read for write-gating. Only an absent doc falls
      // through: "not in cache" may just mean "not synced yet".
      try {
        const cached = await getDocFromCache(ref);
        if (cached.exists()) return valueOf(cached);
      } catch {
        // not cached — fall back to the default (server-first) read
      }
      const snap = await getDoc(ref);
      if (!snap.exists()) return null;
      return valueOf(snap);
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
      let unsubscribe: (() => void) | null = null;
      let disposed = false;
      let retried = false;
      let retryTimer: ReturnType<typeof setTimeout> | null = null;
      const listen = () => {
        unsubscribe = onSnapshot(
          ref,
          // includeMetadataChanges: without it the "write confirmed" snapshot
          // described below never arrives, so a write made on this device
          // outside useSyncedState (e.g. Apple sign-in seeding the profile
          // name) never reached the UI and was then overwritten.
          { includeMetadataChanges: true },
          (snap) => {
            // Skip snapshots that fire while a local write is still pending —
            // the SDK may serve a pre-write cache value here, which would
            // clobber the user's just-applied optimistic update with stale
            // data (the old "checkbox toggle doesn't stick" / "subtask date
            // reverts" reports). Once the server confirms the write, the next
            // snapshot fires with hasPendingWrites=false and matches
            // lastSerializedRef, so subscribe stays a no-op for our own
            // echoes. Cross-device updates from other clients still come
            // through normally.
            if (snap.metadata.hasPendingWrites) return;
            // A cache-only "doesn't exist" may just mean "not synced yet".
            const trusted = !snap.metadata.fromCache || snap.exists();
            if (!snap.exists()) return callback(null, { trusted });
            callback(valueOf(snap), { trusted });
          },
          (err) => {
            const code = (err as { code?: string }).code ?? "";
            if (code.includes("permission-denied")) {
              // Expected during the sign-out / uid-swap teardown window — the
              // listener can outlive auth for a tick (then we're disposed).
              // But it also happens when the listener attaches before the
              // auth token is usable; a dead listener then means no trusted
              // snapshot, so writes could stay locked all session. Retry
              // once, shortly, if still subscribed.
              if (disposed || retried) return;
              retried = true;
              retryTimer = setTimeout(() => {
                retryTimer = null;
                if (!disposed) listen();
              }, SUBSCRIBE_RETRY_MS);
              return;
            }
            console.warn("Firestore subscribe error:", err);
          },
        );
      };
      listen();
      return () => {
        disposed = true;
        if (retryTimer) clearTimeout(retryTimer);
        unsubscribe?.();
      };
    },
  };
}
