# Spike: persistence at scale — single-doc → per-doc

**Status:** INFRASTRUCTURE + DEFAULT-OFF DUAL-WRITE SCAFFOLDING BUILT + tested
(2026-06). The live read-cutover + single-doc drop remain, gated on on-device
QA (see "Cutover checklist" below). **Author:** architecture review, 2026-06.

### Implementation progress
- ✅ `CollectionAdapter` port + `CollectionEntry` + `itemCollectionPath` (core).
- ✅ Cloud adapters: `makeFirestoreCollectionAdapter` for web (firebase/firestore)
  and mobile (@react-native-firebase) — `{value,updatedAt}` envelope reused.
- ✅ Local (signed-out) adapters: `makeLocalCollectionAdapter` for mobile
  (AsyncStorage, keyed `todos/{id}`) and web (localStorage) — unit-tested
  (`web/src/adapters/localCollectionAdapter.test.ts`). Prefix scan can't
  collide with the bare single-doc keys.
- ✅ Sync brain: `syncCollection` (whole-array → minimal per-item upserts/
  removes) + `backfillCollection` (idempotent, forward-only) — unit-tested.
- ✅ Rules: `match /users/{uid}/todos/{todoId}` (owner-only, shape cap,
  per-item delete allowed) + emulator integration tests.
- ✅ **Dual-write scaffolding (default-OFF):** `useCollectionDualWrite`
  (debounced per-item diff via `syncCollection`) wired into mobile
  `useTodoStore` for `todos`, gated by `TODOS_PER_DOC_DUAL_WRITE` in
  `mobile/src/app/featureFlags.ts` (**`= false`**). When off it never touches
  the collection — zero behavior change. When on, it shadow-populates the
  per-item collection alongside the existing single-doc write; reads stay on
  the single doc, so it's non-destructive and reversible.
- ⏳ **Read-cutover + drop (remaining, QA-gated):** flip the flag on after
  on-device QA, backfill stragglers, switch reads to the collection behind a
  staged-rollout profile flag, then stop writing + drop the single doc. NOT
  rushed: flipping the live read path without device QA risks data loss.

### Cutover checklist (do these IN ORDER, mobile first)
1. **Flip `TODOS_PER_DOC_DUAL_WRITE = true`** in a dev build; verify on a real
   device that edits land in `users/{uid}/todos/{id}` (Firestore console) AND
   the single doc still updates. No UI change expected.
2. **Backfill** existing users once via `backfillCollection` (idempotent) so
   pre-flag todos populate the collection.
3. **Multi-device QA:** edit different todos on two devices within the debounce
   window — confirm per-item docs don't clobber each other (the conflict win).
   **Offline QA:** edit offline, reconnect, confirm the queue drains per-item.
4. **Cleanup wiring (before drop):** `signOut` / `clearKnownUserData` /
   `clearAllData` currently only clear the bare single-doc keys — extend them
   to delete the per-item collection too, or signed-out devices leak
   `todos/{id}` across accounts. (Harmless while dual-write is off.)
5. **Read-cutover** behind a `profile.todosPerDoc` staged-rollout flag (build a
   per-doc `migrateTodo(one)` + a collection-hydration hook); single doc stays
   the fallback for one release.
6. **Drop:** stop writing the single doc, leave it readable one release, remove.
- Repeat the whole sequence for `groceries` (the other unbounded hot
  collection) — the wiring is identical; only `todos` is scaffolded today.

## 1. Problem

Every persisted entity is **one Firestore document** holding the whole
collection: `users/{uid}/state/todos` is a single doc whose `value` is the
JSON-serialized *entire* todos array (same for `categories`, `groceries`,
`groceryGroups`). See `core/src/ports/persistence.ts → stateDocPath`.

This is great today and the correct v1 call — one read paints the whole
app, writes are atomic, and the security rules are trivial. But it has
three coupled limits, all rooted in the document granularity:

| Symptom | Cause | Bite |
|---|---|---|
| **Write amplification** | every (debounced) edit re-serializes + re-uploads the whole array | toggling one of 800 todos = a ~hundreds-of-KB write; cost/latency scale with library size, not edit size |
| **Whole-doc last-write-wins** | two devices write the same doc; later `updatedAt` wins the *entire* value | device A edits todo X, device B edits todo Y within the debounce window → one silently loses the other's change |
| **Hard ceiling** | rules cap `value` at 512 KiB; `MAX_TODOS_PER_USER = 10_000` | a multi-year power user can hit "can't save" |

None bites at current scale. All three get worse monotonically with todo
count and multi-device use.

## 2. Constraints any solution must keep

- **Offline-first.** Firestore `persistentLocalCache` is enabled
  (`firebase.ts`); repeat loads must paint from cache, edits must queue offline.
- **Cross-device live sync** via `onSnapshot` (the `StorageAdapter.subscribe` port).
- **The `{version,data}` envelope + migrators** (`docs/MIGRATIONS.md`) — byte-identical across web/mobile/Firestore.
- **The `StorageAdapter` port abstraction** — the store shouldn't care which backend.
- **Cost.** Firestore bills per document read/write. The current model is
  *read-cheap, write-expensive*; don't blindly flip to *write-cheap, read-ruinous*.

## 3. Options

### A — Single doc per entity (status quo)
- **Reads:** 1 doc read paints everything. Excellent offline (1 cached doc).
- **Writes:** whole-array rewrite. Amplifies with size.
- **Conflict:** whole-doc LWW (coarsest).
- **Cap:** 512 KiB / 10k.
- **Complexity:** trivial rules, trivial adapter.

### B — Document per todo: `users/{uid}/todos/{todoId}`
- **Reads:** a collection listener = **N doc reads** on cold load (1 per
  todo). Mitigated heavily by `persistentLocalCache` — only the *delta*
  syncs on warm loads — but the first load / a cache eviction is N reads.
- **Writes:** one small doc per edit. No amplification. No list cap.
- **Conflict:** **per-todo LWW** — concurrent edits to *different* todos no
  longer collide (the big win); same-todo still LWW (acceptable).
- **Complexity:** per-doc rules (shape-check each todo), a collection-oriented
  adapter + `useSyncedState`-equivalent over a query, an index or two, and
  the migrator runs per-doc.

### C — Sharded docs (e.g., one doc per month-bucket, or N hash shards)
- **Reads:** bounded (handful of shard docs).
- **Writes:** rewrite only the touched shard (bounded size).
- **Conflict:** shard-doc LWW (medium — collides only within a shard).
- **Complexity:** shard-assignment + cross-shard moves (a todo's due-date
  edit can move it between month-shards) — fiddly, easy to get wrong.

## 4. Tradeoff summary

| | A single-doc | B per-todo | C sharded |
|---|---|---|---|
| Cold read cost | **1** | N | few |
| Warm read (cache) | 1 | delta | delta |
| Write cost/size | whole array | **1 small doc** | 1 shard |
| Conflict granularity | whole list | **per todo** | per shard |
| Scale ceiling | 512 KiB/10k | **none practical** | high |
| Rules complexity | **trivial** | per-doc shape | per-shard |
| Impl effort | — | medium | medium-high |
| Offline simplicity | **best** | good | good |

## 5. Recommendation

**Target B (document per todo) when the trigger fires; do nothing until
then.** Rationale:

- The two *ongoing* costs of the status quo (write amplification + whole-doc
  LWW) are paid on **every edit, forever**, and worsen with growth.
- B's main downside (N cold reads) is a **one-time / cache-miss** cost that
  `persistentLocalCache` already amortizes — warm loads sync only deltas.
  At Firestore pricing, even 1–2k doc reads on a rare cold load is cents.
- B fixes conflict granularity, which is the prerequisite for *any* future
  shared/delegated-list feature.
- C's cross-shard-move complexity buys little over B given the cache
  mitigates B's read cost; not worth the bug surface.

Apply B to `todos` and `groceries` (the unbounded, hot-write collections).
Keep `profile` (and `categories`, which is tiny + bounded) as single docs —
per-doc there is pure overhead.

## 6. Trigger (when to implement)

Don't pre-build. Implement when **any** of:
- p95 user todo count > ~1,000 (instrument it — emit count on load), **or**
- a shared/multi-user list feature is greenlit (needs per-item conflict), **or**
- support reports of lost edits across devices, **or**
- any user approaches the 512 KiB cap (alertable from the write path).

## 7. Migration plan (phased, forward-compatible)

The `StorageAdapter` port is the seam — most of this lives behind a new
collection-aware adapter, not in the store/UI.

1. **Add a `CollectionAdapter` port** (`getAll`/`upsert(id)`/`remove(id)`/
   `subscribeCollection`) alongside the existing key/value `StorageAdapter`.
   Firestore impl uses `collection(users/{uid}/todos)` + per-doc writes +
   a collection `onSnapshot`. Local impl backs it with the same AsyncStorage/
   localStorage (keyed `todos/{id}`) for the signed-out path.
2. **Dual-read, single-write-old (shadow):** read from the single doc as
   today; in the background backfill per-todo docs. No behavior change;
   validates the new collection populates correctly.
3. **Dual-write:** writes go to BOTH the single doc and per-todo docs;
   reads still from the single doc. De-risks rollback.
4. **Cut read over** to the collection adapter behind a profile flag
   (`todosPerDoc`), staged rollout. Single doc becomes the fallback.
5. **Backfill + drop:** one-time backfill for stragglers; stop writing the
   single doc; leave it readable for one release as a safety net, then remove.
- Rules: add `match /users/{uid}/todos/{todoId}` mirroring the state shape
  check (per-doc `{...todo fields}`, owner-only, size cap), keep delete
  explicit (`docs/MIGRATIONS.md` philosophy).
- Migrators: `migrateTodos` becomes per-doc (`migrateTodo(one)`); the
  golden-fixture tests extend trivially.

## 8. Effort & risk

- **Effort:** ~1–2 weeks (new port + Firestore/local impls + dual-write +
  rules + collection-listener perf tuning + migration/backfill + tests).
- **Risk:** medium. Mitigants: the `StorageAdapter` seam contains the blast
  radius; the dual-write phase makes it reversible; the emulator adapter
  tests (`web/tests/firestore-adapter.test.ts`) extend to cover the
  collection adapter before cutover.
- **Do NOT** do a big-bang switch — the phased dual-write is the whole point.

## Decision

Record the trigger (§6) and instrument the todo-count signal now (cheap).
Keep single-doc until a trigger fires; then execute §7 toward option B for
`todos`/`groceries`. This spike is the plan of record.
