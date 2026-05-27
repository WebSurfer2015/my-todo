// Versioned envelope shared by every slice's `useSyncedState` call.
// The same `{version, data}` shape is written by AsyncStorage (local)
// and by Firestore (cloud) so the cross-device payload stays
// byte-identical.

const SCHEMA_VERSION = 1;

export function unwrap(raw: string | null): unknown {
  if (raw == null) return null;
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      "version" in parsed &&
      "data" in parsed
    ) {
      return (parsed as { data: unknown }).data;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function wrap(data: unknown): string {
  return JSON.stringify({ version: SCHEMA_VERSION, data });
}

export const serializeAny = (v: unknown): string => wrap(v);
