import { Dispatch, SetStateAction, useEffect, useRef, useState } from "react";
import { StorageAdapter } from "../../../core/src/ports/persistence";

/**
 * Async state hook backed by a StorageAdapter. On mount (and whenever the
 * adapter changes) it hydrates from `adapter.getItem(key)`, then subscribes
 * to remote changes if the adapter supports it. Local mutations write through
 * the adapter via a useEffect.
 *
 * A `lastSerializedRef` tracks the last-seen-or-written value so the
 * write→subscribe→setState loop terminates on round-trip echoes.
 *
 * `onSaved`: optional callback fired when adapter.setItem resolves. The
 * timestamp lets the UI show an anxiety-friendly "Saved · just now" affordance
 * without needing to change the public tuple shape.
 */
export function useSyncedState<T>(
  adapter: StorageAdapter,
  key: string,
  initial: T,
  parse: (raw: string | null) => T,
  serialize: (value: T) => string,
  onSaved?: (savedAt: number) => void,
): [T, Dispatch<SetStateAction<T>>, boolean] {
  const [state, setState] = useState<T>(initial);
  const [loaded, setLoaded] = useState(false);
  const lastSerializedRef = useRef<string | null>(null);
  const parseRef = useRef(parse);
  const serializeRef = useRef(serialize);
  const onSavedRef = useRef(onSaved);
  parseRef.current = parse;
  serializeRef.current = serialize;
  onSavedRef.current = onSaved;

  // Hydrate when adapter or key changes
  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    adapter
      .getItem(key)
      .then((raw) => {
        if (cancelled) return;
        lastSerializedRef.current = raw;
        setState(parseRef.current(raw));
        setLoaded(true);
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn(`useSyncedState[${key}] hydrate failed:`, err);
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [adapter, key]);

  // Subscribe to remote changes (Firestore); no-op for KV-only adapters.
  //
  // Two-step equality: a byte-level raw match short-circuits early; otherwise
  // we parse-then-reserialize the incoming raw and compare against
  // lastSerializedRef. This handles the case where Firestore stores an older
  // "thin" doc (e.g. subs stored before the priority/dueDate fields existed)
  // — migrateTodos fills in defaults on parse, so the reserialized form
  // equals our last-written "fat" form. Skipping that overwrite is what
  // prevents stale Firestore docs from clobbering a freshly-picked date.
  useEffect(() => {
    if (!adapter.subscribe) return;
    return adapter.subscribe(key, (raw) => {
      if (raw === lastSerializedRef.current) return;
      const parsed = parseRef.current(raw);
      const normalized = serializeRef.current(parsed);
      if (normalized === lastSerializedRef.current) return; // defaults-only diff
      lastSerializedRef.current = raw;
      setState(parsed);
    });
  }, [adapter, key]);

  // Write through adapter, trailing-debounced ~400ms. Without debouncing,
  // every keystroke during a text edit fires a full setDoc to Firestore —
  // burns billed writes and pushes stale snapshots to other devices.
  useEffect(() => {
    if (!loaded) return;
    const json = serializeRef.current(state);
    if (json === lastSerializedRef.current) return;
    const handle = setTimeout(() => {
      // Re-check inside the timer: a remote snapshot may have arrived during
      // the wait and updated lastSerializedRef to match `json` already.
      if (json === lastSerializedRef.current) return;
      lastSerializedRef.current = json;
      adapter
        .setItem(key, json)
        .then(() => onSavedRef.current?.(Date.now()))
        .catch((err) => {
          console.warn(`useSyncedState[${key}] write failed:`, err);
        });
    }, 400);
    return () => clearTimeout(handle);
  }, [adapter, key, loaded, state]);

  return [state, setState, loaded];
}
