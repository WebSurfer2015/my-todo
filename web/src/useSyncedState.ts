import { Dispatch, SetStateAction, useEffect, useRef, useState } from "react";
import { StorageAdapter } from "../../core/src/persistence";

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

  // Subscribe to remote changes (Firestore); no-op for KV-only adapters
  useEffect(() => {
    if (!adapter.subscribe) return;
    return adapter.subscribe(key, (raw) => {
      const matches = raw === lastSerializedRef.current;
      if (key === "todos") {
        console.log(`[bug] subscribe[${key}] fired`, {
          rawLen: raw?.length ?? 0,
          lastLen: lastSerializedRef.current?.length ?? 0,
          matches,
          rawTail: raw?.slice(-200) ?? null,
          lastTail: lastSerializedRef.current?.slice(-200) ?? null,
        });
      }
      if (matches) return;
      lastSerializedRef.current = raw;
      setState(parseRef.current(raw));
      if (key === "todos") console.log(`[bug] subscribe[${key}] OVERWROTE local state`);
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
      if (key === "todos") console.log(`[bug] write[${key}] firing`, { jsonTail: json.slice(-200) });
      adapter
        .setItem(key, json)
        .then(() => {
          if (key === "todos") console.log(`[bug] write[${key}] settled`);
          onSavedRef.current?.(Date.now());
        })
        .catch((err) => {
          console.warn(`useSyncedState[${key}] write failed:`, err);
        });
    }, 400);
    return () => clearTimeout(handle);
  }, [adapter, key, loaded, state]);

  return [state, setState, loaded];
}
