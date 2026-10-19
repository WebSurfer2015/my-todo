import { Dispatch, SetStateAction, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { StorageAdapter } from "../../../core/src/ports/persistence";

/** Upper bound on a single entity's first hydrate read. Firestore (with the
 * offline cache) normally resolves in ms or rejects; this only catches a
 * pathological stall so the launch gate can never trap the user on the
 * loading screen. */
const HYDRATE_TIMEOUT_MS = 12000;

/**
 * Async state hook backed by a StorageAdapter. Hydrates from
 * adapter.getItem(key), subscribes to remote changes if supported, writes
 * back through adapter.setItem on local mutations.
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
): [T, Dispatch<SetStateAction<T>>, boolean] {
  const [state, setState] = useState<T>(initial);
  const [loaded, setLoaded] = useState(false);
  const lastSerializedRef = useRef<string | null>(null);
  const parseRef = useRef(parse);
  const serializeRef = useRef(serialize);
  // Mirrored like parse/serialize: callers often pass a fresh literal (e.g.
  // `[]`), which must not re-run the hydrate effect.
  const initialRef = useRef(initial);
  parseRef.current = parse;
  serializeRef.current = serialize;
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
  // returns. Edits made in that window stay local until real data arrives,
  // which then replaces them — losing a few offline edits beats wiping the
  // account.
  const canWriteRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let settled = false;
    setLoaded(false);
    canWriteRef.current = false;
    // Proceed-with-defaults fallback shared by the catch and the timeout: don't
    // let the trailing-debounced write push our default/empty state back to
    // cloud over data we merely failed to READ. Seed the ref with the default
    // so the write effect treats it as already-persisted (no write fires); a
    // later getItem resolution or subscribe() snapshot recovers from here.
    const proceedWithDefaults = () => {
      lastSerializedRef.current = serializeRef.current(initialRef.current);
      setLoaded(true);
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
        canWriteRef.current = true;
        lastSerializedRef.current = raw;
        setState(parseRef.current(raw));
        setLoaded(true);
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
  }, [adapter, key]);

  useEffect(() => {
    if (!adapter.subscribe) return;
    return adapter.subscribe(key, (raw, meta) => {
      if (meta?.trusted === false && !canWriteRef.current) return;
      // The first trusted snapshot after a failed read is the real data:
      // apply it even if it matches the defaults we were showing.
      const firstTrusted = !canWriteRef.current;
      canWriteRef.current = true;
      if (raw === lastSerializedRef.current && !firstTrusted) return;
      // Two-step equality (ported from web): a raw byte match short-
      // circuits; otherwise parse-then-reserialize and compare. When
      // Firestore holds an older "thin" doc (e.g. fields stored before a
      // migrator added defaults), migrate*() fills the defaults on parse,
      // so the reserialized form equals our last-written "fat" form.
      // Skipping that overwrite is what stops a stale cloud doc from
      // clobbering a freshly-picked date/value mid-edit.
      const parsed = parseRef.current(raw);
      const normalized = serializeRef.current(parsed);
      if (normalized === lastSerializedRef.current) return;
      lastSerializedRef.current = raw;
      setState(parsed);
    });
  }, [adapter, key]);

  // Trailing-debounced write (~400ms) so a burst of mutations (typing in a
  // task title) collapses into a single Firestore setDoc instead of one
  // per keystroke.
  useEffect(() => {
    if (!loaded || !canWriteRef.current) return;
    const json = serializeRef.current(state);
    if (json === lastSerializedRef.current) return;
    const handle = setTimeout(() => {
      if (json === lastSerializedRef.current) return;
      lastSerializedRef.current = json;
      adapter
        .setItem(key, json)
        .catch((err) => {
          console.warn(`useSyncedState[${key}] write failed:`, err);
        });
    }, 400);
    return () => clearTimeout(handle);
  }, [adapter, key, loaded, state]);

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
      lastSerializedRef.current = json;
      adapterRef.current
        .setItem(keyRef.current, json)
        .catch((err) => {
          console.warn(
            `useSyncedState[${keyRef.current}] background flush failed:`,
            err,
          );
        });
    });
    return () => sub.remove();
  }, []);

  return [state, setState, loaded];
}
