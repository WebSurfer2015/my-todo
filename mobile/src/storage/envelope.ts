// Versioned envelope shared by every slice's `useSyncedState` call — the
// `{version, data}` shape lives in core's persistence port (wrapEnvelope /
// unwrapEnvelope). Firestore stores it as each state doc's `value`, and the
// device-local language setting (adapters/persistence, AsyncStorage) uses
// the same envelope. Anything that isn't an envelope reads as null (empty).
import { unwrapEnvelope, wrapEnvelope } from "../../../core/src/ports/persistence";

export const unwrap = (raw: string | null): unknown => unwrapEnvelope(raw);

export const wrap = (data: unknown): string => wrapEnvelope(data);

export const serializeAny = (v: unknown): string => wrap(v);
