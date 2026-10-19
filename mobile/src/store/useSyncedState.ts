import { Dispatch, SetStateAction, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import {
  StorageAdapter,
  exceedsSyncedValueCap,
} from "../../../core/src/ports/persistence";
import { mergeTodos } from "../../../core/src/store";

/** Upper bound on a single entity's first hydrate read. Firestore (with the
 * offline cache) normally resolves in ms or rejects; this only catches a
 * pathological stall so the launch gate can never trap the user on the
 * loading screen. */
const HYDRATE_TIMEOUT_MS = 12000;

/** 3-way merge used when a remote snapshot lands on top of an unsaved local
 * change: `base` is the last value both sides agreed on (null if unknown). */
export type SyncedMerge<T> = (base: T | null, local: T, remote: T) => T;

export interface SyncedStateOptions<T> {
  /** Merge instead of replace when a remote value arrives while a local
   * change is still unwritten. Without one, the remote value wins. */
  merge?: SyncedMerge<T>;
}

/** Keys that merge by default. `todos` is one doc holding the whole list, so
 * replace-on-snapshot was last-writer-wins across devices. Lives here (not
 * only as an option) because the todos slice calls this hook directly. */
const DEFAULT_MERGE: Record<string, unknown> = {
  todos: mergeTodos,
};

/** Something the user should hear about, reported by every synced key. */
export type SyncIssue =
  /** Serialized value is over the doc cap — the write was skipped. */
  | { kind: "tooLarge"; key: string }
  /** A write was rejected for a reason other than permission-denied. */
  | { kind: "writeFailed"; key: string; error: unknown };

const issueListeners = new Set<(issue: SyncIssue) => void>();

/** Subscribe to sync issues (the store shows a calm snackbar). Returns an
 * unsubscribe. Module-level so it covers every slice's keys without
 * threading a callback through each one. */
export function onSyncIssue(listener: (issue: SyncIssue) => void): () => void {
  issueListeners.add(listener);
  return () => {
    issueListeners.delete(listener);
  };
}

function reportSyncIssue(issue: SyncIssue): void {
  issueListeners.forEach((l) => {
    try {
      l(issue);
    } catch {
      // a listener bug must never break a write path
    }
  });
}

// Which (adapter, key) pairs have seen REAL data. Lets the composer gate
// effects on keys whose hook lives in a slice that doesn't surface the flag.
const trustedKeys = new WeakMap<StorageAdapter, Set<string>>();

/** True once `key` on `adapter` has seen real data (a resolved read or a
 * trusted snapshot) — not defaults from a failed / timed-out hydrate. */
export function isSyncedKeyTrusted(adapter: StorageAdapter, key: string): boolean {
  return trustedKeys.get(adapter)?.has(key) === true;
}

function markTrusted(adapter: StorageAdapter, key: string): void {
  let keys = trustedKeys.get(adapter);
  if (!keys) {
    keys = new Set();
    trustedKeys.set(adapter, keys);
  }
  keys.add(key);
}

/** Write `json` unless it's over the doc cap. Advances lastSerialized only
 * when a write is actually sent. */
function persist(
  adapter: StorageAdapter,
  key: string,
  json: string,
  lastSerializedRef: { current: string | null },
  label: string,
): void {
  if (exceedsSyncedValueCap(json)) {
    reportSyncIssue({ kind: "tooLarge", key });
    return;
  }
  lastSerializedRef.current = json;
  adapter.setItem(key, json).catch((err) => {
    console.warn(`useSyncedState[${key}] ${label} failed:`, err);
    // permission-denied is the expected sign-out / uid-swap teardown race.
    const code = String((err as { code?: unknown } | null)?.code ?? "");
    if (!code.includes("permission-denied")) {
      reportSyncIssue({ kind: "writeFailed", key, error: err });
    }
  });
}

/**
 * Async state hook backed by a StorageAdapter. Hydrates from
 * adapter.getItem(key), subscribes to remote changes if supported, writes
 * back through adapter.setItem on local mutations.
 *
 * Returns `[state, setState, loaded, trusted]`:
 * - `loaded` — the first hydrate for THIS adapter settled (real data or
 *   defaults). Scoped to the adapter, so right after a uid swap it is false
 *   in the very same render, not one frame later.
 * - `trusted` — the state came from real data (a resolved read or a trusted
 *   snapshot), not defaults after a failed / timed-out hydrate.
 *
 * `lastSerializedRef` tracks last-seen-or-written value so write→subscribe→
 * setState round-trips don't recurse.
 */
export function useSyncedState<T>(
  adapter: StorageAdapter,
  key: string,
  initial: T,
  parse: (raw: string | null) => T,
  serialize: (value: T) => string,
  options?: SyncedStateOptions<T>,
): [T, Dispatch<SetStateAction<T>>, boolean, boolean] {
  const [state, setState] = useState<T>(initial);
  // Scope token: loaded/trusted are only true for the (adapter, key) they
  // were reached on.
  const scope = useMemo(() => ({ adapter, key }), [adapter, key]);
  const [loadedFor, setLoadedFor] = useState<typeof scope | null>(null);
  const [trustedFor, setTrustedFor] = useState<typeof scope | null>(null);
  const loaded = loadedFor === scope;
  const trusted = trustedFor === scope;
  const lastSerializedRef = useRef<string | null>(null);
  const parseRef = useRef(parse);
  const serializeRef = useRef(serialize);
  const mergeRef = useRef(
    options?.merge ?? (DEFAULT_MERGE[key] as SyncedMerge<T> | undefined),
  );
  // Mirrored like parse/serialize: callers often pass a fresh literal (e.g.
  // `[]`), which must not re-run the hydrate effect.
  const initialRef = useRef(initial);
  parseRef.current = parse;
  serializeRef.current = serialize;
  mergeRef.current =
    options?.merge ?? (DEFAULT_MERGE[key] as SyncedMerge<T> | undefined);
  initialRef.current = initial;
  // Latest values mirrored into refs so the AppState background-flush
  // listener (registered once) can read current state/adapter/key/loaded
  // without re-subscribing on every change.
  const stateRef = useRef(state);
  stateRef.current = state;
  const adapterRef = useRef(adapter);
  adapterRef.current = adapter;
  const keyRef = useRef(key);
  keyRef.current = key;
  const loadedRef = useRef(loaded);
  loadedRef.current = loaded;
  // Writes are only allowed once we've seen REAL data for this key (a
  // resolved read, or a trusted snapshot). After a failed / timed-out read
  // the UI shows defaults, but writing them (or the first edit on top of
  // them) would replace the user's whole cloud doc once the connection
  // returns. Edits made in that window stay local until real data arrives;
  // then they're merged (keys with a merge) or replaced by it, and whatever
  // differs is written — `trusted` is a write-effect dep for exactly that.
  const canWriteRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let settled = false;
    canWriteRef.current = false;
    const becomeTrusted = () => {
      canWriteRef.current = true;
      markTrusted(scope.adapter, scope.key);
      setTrustedFor(scope);
    };
    // Proceed-with-defaults fallback shared by the catch and the timeout: don't
    // let the trailing-debounced write push our default/empty state back to
    // cloud over data we merely failed to READ. Seed the ref with the default
    // so the write effect treats it as already-persisted (no write fires); a
    // later getItem resolution or subscribe() snapshot recovers from here.
    const proceedWithDefaults = () => {
      lastSerializedRef.current = serializeRef.current(initialRef.current);
      setLoadedFor(scope);
    };
    // A getItem read that STALLS (socket open but never responds — captive
    // portal, dead connection before the cache warms) would never settle, so
    // `loaded` would never flip and the user is trapped on the launch
    // LoadingScreen. Bound it: after the timeout, proceed with defaults.
    const timeout = setTimeout(() => {
      if (cancelled || settled) return;
      settled = true;
      console.warn(`useSyncedState[${key}] hydrate timed out — using defaults`);
      proceedWithDefaults();
    }, HYDRATE_TIMEOUT_MS);
    adapter
      .getItem(key)
      .then((raw) => {
        settled = true;
        if (cancelled) return;
        const parsed = parseRef.current(raw);
        // A MISSING doc: treat the defaults as already saved, so they aren't
        // written 400ms later. That write raced (and could overwrite) a doc
        // created elsewhere on this device — e.g. Apple/Google sign-in
        // seeding the profile name, which Apple only sends once. The first
        // real edit still writes.
        lastSerializedRef.current = raw === null ? serializeRef.current(parsed) : raw;
        setState(parsed);
        becomeTrusted();
        setLoadedFor(scope);
      })
      .catch((err) => {
        settled = true;
        if (cancelled) return;
        console.warn(`useSyncedState[${key}] hydrate failed:`, err);
        proceedWithDefaults();
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [adapter, key, scope]);

  useEffect(() => {
    if (!adapter.subscribe) return;
    return adapter.subscribe(key, (raw, meta) => {
      if (meta?.trusted === false && !canWriteRef.current) return;
      // The first trusted snapshot after a failed read is the real data:
      // apply it even if it matches the defaults we were showing.
      const firstTrusted = !canWriteRef.current;
      if (firstTrusted) {
        canWriteRef.current = true;
        markTrusted(scope.adapter, scope.key);
        setTrustedFor(scope);
      }
      if (raw === lastSerializedRef.current && !firstTrusted) return;
      // Two-step equality: a raw byte match short-circuits; otherwise
      // parse-then-reserialize and compare. When Firestore holds an older
      // "thin" doc (e.g. fields stored before a migrator added defaults),
      // migrate*() fills the defaults on parse, so the reserialized form
      // equals our last-written "fat" form. Skipping that overwrite is what
      // stops a stale cloud doc from clobbering a freshly-picked date/value
      // mid-edit.
      const parsed = parseRef.current(raw);
      const normalized = serializeRef.current(parsed);
      if (normalized === lastSerializedRef.current) return;
      const baseRaw = lastSerializedRef.current;
      lastSerializedRef.current = raw;
      const merge = mergeRef.current;
      // Only once hydrated for THIS adapter — before that, `state` may still
      // hold the previous account's data.
      if (!merge || !loadedRef.current) {
        setState(parsed);
        return;
      }
      // A local change not yet written (debounce pending, or edits made
      // while writes were locked): merge instead of letting the snapshot
      // replace it. The write effect then sees merged ≠ remote and writes
      // the union back.
      const serializeNow = serializeRef.current;
      const base = baseRaw === null ? null : parseRef.current(baseRaw);
      setState((prev) =>
        serializeNow(prev) === baseRaw ? parsed : merge(base, prev, parsed),
      );
    });
  }, [adapter, key, scope]);

  // Trailing-debounced write (~400ms) so a burst of mutations (typing in a
  // task title) collapses into a single Firestore setDoc instead of one
  // per keystroke. `trusted` is a dep so edits made while writes were
  // locked are written as soon as real data unlocks them.
  useEffect(() => {
    if (!loaded || !trusted || !canWriteRef.current) return;
    const json = serializeRef.current(state);
    if (json === lastSerializedRef.current) return;
    const handle = setTimeout(() => {
      if (json === lastSerializedRef.current) return;
      persist(adapter, key, json, lastSerializedRef, "write");
    }, 400);
    return () => clearTimeout(handle);
  }, [adapter, key, loaded, trusted, state]);

  // Flush a pending debounced write synchronously when the app goes to the
  // background / inactive. The trailing-debounce effect's cleanup only
  // CANCELS its timer — so a mutation followed by a background or force-quit
  // inside the ~400ms window would be lost to both AsyncStorage and
  // Firestore. Writing the latest serialized value here closes that window
  // (and advances lastSerializedRef so the normal debounce won't double-write).
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next !== "background" && next !== "inactive") return;
      if (!loadedRef.current || !canWriteRef.current) return;
      const json = serializeRef.current(stateRef.current);
      if (json === lastSerializedRef.current) return;
      persist(adapterRef.current, keyRef.current, json, lastSerializedRef, "background flush");
    });
    return () => sub.remove();
  }, []);

  return [state, setState, loaded, trusted];
}
