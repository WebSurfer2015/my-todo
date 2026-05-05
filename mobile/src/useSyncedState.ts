import { Dispatch, SetStateAction, useEffect, useRef, useState } from "react";
import { StorageAdapter } from "../../core/src/persistence";

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
  parseRef.current = parse;
  serializeRef.current = serialize;

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

  useEffect(() => {
    if (!adapter.subscribe) return;
    return adapter.subscribe(key, (raw) => {
      if (raw === lastSerializedRef.current) return;
      lastSerializedRef.current = raw;
      setState(parseRef.current(raw));
    });
  }, [adapter, key]);

  useEffect(() => {
    if (!loaded) return;
    const json = serializeRef.current(state);
    if (json === lastSerializedRef.current) return;
    lastSerializedRef.current = json;
    adapter.setItem(key, json).catch((err) => {
      console.warn(`useSyncedState[${key}] write failed:`, err);
    });
  }, [adapter, key, loaded, state]);

  return [state, setState, loaded];
}
