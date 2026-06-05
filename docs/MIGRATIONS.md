# Schema migrations & versioning

How persisted data evolves safely across app versions and devices. Read
this before changing any persisted shape (`Todo`, `Profile`, `Category`,
grocery types) or bumping `SCHEMA_VERSION`.

## The envelope

Every persisted entity is wrapped in a versioned envelope, identical on
all three storage backends (web `localStorage`, mobile `AsyncStorage`,
Firestore `users/{uid}/state/{key}.value`):

```json
{ "version": 1, "data": <entity> }
```

`SCHEMA_VERSION = 1` lives in `core/src/ports/persistence.ts`. The byte
shape is intentionally identical across backends so the **same migrator**
handles a value no matter where it was read — that's what makes
cross-device sync safe.

## Two layers of migration (both required)

1. **Shape coercion (always-on, version-agnostic).** The `migrate*`
   functions — `migrateTodos`, `migrateProfile`, `migrateCategories`,
   `migrateGroceries`, `migrateGroceryGroups`, `migrateTodoReferences` —
   defensively validate/clamp/repair whatever they're given: drop garbage
   rows, cap lengths (`MAX_*`), dedup, fill defaults, and **promote legacy
   shapes** (e.g. grocery `store: string` → `stores: string[]`; avatar
   `data` → `uri`). They never throw; bad input degrades to a safe value.
   These run on *every* read regardless of `version`.

2. **Feature migrations (one-way, flagged).** Larger structural changes
   ride a profile flag, not the envelope version — e.g. recurrence-v2
   (`migrateToRecurringV2`, gated by `profile.recurringV2`) promotes rolling
   recurring todos into pre-expanded series exactly once per user.

Golden-fixture tests pin layer 1 in `web/src/migration-fixtures.test.ts`
and `web/src/migration.test.ts`. **Add a fixture for any new legacy→new
promotion.**

## Bumping `SCHEMA_VERSION` (the protocol — follow it)

We are at **v1** with no `switch(version)` dispatch yet, because no
breaking change has needed one. When the first one does:

1. **Add version dispatch at the read boundary**, not ad-hoc per field:
   ```ts
   export function migrateTodos(raw: unknown): Todo[] {
     const { version, data } = unwrapEnvelope(raw)
     let d = data
     if (version < 2) d = v1ToV2(d)   // each step pure + golden-fixture tested
     if (version < 3) d = v2ToV3(d)
     return coerceShape(d)            // existing layer-1 coercion, last
   }
   ```
2. **Migrations are forward-only and additive.** Never delete a `vNtoVN+1`
   step — old data can surface from a stale device or a cold Firestore doc
   years later.
3. **Deploy readers before writers.** A client that can READ v(N+1) must be
   in the field before any client WRITES v(N+1); otherwise an old reader
   chokes on new data. In practice: ship the migration in a release, let it
   roll out, *then* start writing the new version.
4. **Bump `SCHEMA_VERSION` in one place** (`core/src/ports/persistence.ts`)
   so every backend writes the new envelope version.
5. **Add golden fixtures** for the transition: a real v(N) payload → the
   expected v(N+1) shape, plus a garbage-v(N) → safe-default case.

## Cross-device & downgrade hazards (know these)

- **One-way feature migrations have no downgrade path.** Recurrence-v2 is
  the live example: once a device pre-expands a series, an *older* build
  (still rolling) that wins an `updatedAt` race could drop the series tail.
  Mitigation today: the migration is idempotent + top-ups on launch; the
  real fix is to gate writes on a minimum app version. **Don't add another
  one-way migration without considering the stale-device case.**
- **Last-write-wins is whole-document, not field-level.** Two devices
  editing the same entity → the later `updatedAt` wins the *entire* value;
  there's no field merge. Fine for single-user; revisit (CRDT/field-merge)
  before any shared/delegated-list feature.
- **`updatedAt` drives LWW** and is stamped by every `verbNoun` mutation in
  `core/src/logic/derive.ts`. A migration that rewrites data on read must
  NOT bump `updatedAt` (it would make a passive read win a sync race).

## Checklist for a schema change

- [ ] Update the type in `core/src/domain/types.ts` (or the entity's module).
- [ ] Add/extend the `migrate*` coercion for the new field (defaults + caps).
- [ ] Add a legacy→new golden fixture in `migration-fixtures.test.ts`.
- [ ] If breaking: add the `vNtoVN+1` dispatch step + bump `SCHEMA_VERSION`.
- [ ] Verify web (`npm test`) + `npm run test:coverage` stay green.
- [ ] Confirm the change is byte-identical across web/mobile/Firestore.
