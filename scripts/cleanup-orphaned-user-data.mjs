#!/usr/bin/env node
/**
 * One-off erasure of ORPHANED user data (roadmap C.2) — Firestore `users/{uid}`
 * trees whose Firebase Auth account no longer exists. Before 2026-10-18,
 * in-app "Delete account" removed only the auth user: firestore.rules deny
 * client deletes on state docs, so every deleted account's data stayed behind.
 * The `onUserDeleted` Cloud Function fixes this going forward; this script
 * erases what was left before it existed. NOT part of the app; run manually.
 *
 * Safety:
 *   - DRY RUN by default: lists orphaned uids + how many docs each holds. No
 *     content is printed or saved. Writes only with --write.
 *   - NO backup, on purpose: these users asked for erasure, and the privacy
 *     policy promises it. Keeping a copy would defeat the point.
 *   - Double-checked orphans: a uid must be absent from the full Auth listing
 *     AND from a per-uid Auth lookup made immediately before its delete.
 *   - Aborts if Auth lists zero users, or if more than MAX_ORPHAN_SHARE of
 *     users/ looks orphaned (an auth/listing failure must never read as
 *     "everyone was deleted"). Override with --allow-many only after checking.
 *
 * Auth: your gcloud user token (same as seed-demo-account.mjs). If it errors
 * on auth, run once:  gcloud auth login
 *
 * Usage:
 *   node scripts/cleanup-orphaned-user-data.mjs            # dry run
 *   node scripts/cleanup-orphaned-user-data.mjs --write    # erase orphans
 */

import { execSync } from 'node:child_process'

const PROJECT = 'my-todos-1b079'
const DB = `projects/${PROJECT}/databases/(default)/documents`
const FS = `https://firestore.googleapis.com/v1/${DB}`
const doWrite = process.argv.includes('--write')
const allowMany = process.argv.includes('--allow-many')
const MAX_ORPHAN_SHARE = 0.5
const COMMIT_BATCH = 400

const token = execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim()
// gcloud user tokens need an explicit quota project (see seed-demo-account.mjs).
const headers = (extra = {}) => ({
  Authorization: `Bearer ${token}`,
  'x-goog-user-project': PROJECT,
  ...extra,
})

async function call(url, init = {}) {
  const res = await fetch(url, { ...init, headers: headers(init.headers) })
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${url} → ${res.status} ${await res.text()}`)
  return res.json()
}

// ── Firebase Auth ────────────────────────────────────────────────────────
async function listAuthUids() {
  const uids = new Set()
  let pageToken
  do {
    const q = new URLSearchParams({ maxResults: '1000', ...(pageToken ? { nextPageToken: pageToken } : {}) })
    const j = await call(
      `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:batchGet?${q}`,
    )
    for (const u of j.users ?? []) uids.add(u.localId)
    pageToken = j.nextPageToken
  } while (pageToken)
  return uids
}

async function authUserExists(uid) {
  const j = await call(`https://identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:lookup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ localId: [uid] }),
  })
  return (j.users ?? []).length > 0
}

// ── Firestore ────────────────────────────────────────────────────────────
/** Doc names directly under a collection, including "missing" parents
 * (users/{uid} usually has no fields — only subcollections). */
async function listDocNames(collectionPath) {
  const names = []
  let pageToken
  do {
    const q = new URLSearchParams({ pageSize: '300', showMissing: 'true', 'mask.fieldPaths': '__name__' })
    if (pageToken) q.set('pageToken', pageToken)
    const j = await call(`${FS}/${collectionPath}?${q}`)
    for (const d of j.documents ?? []) names.push(d.name)
    pageToken = j.nextPageToken
  } while (pageToken)
  return names
}

async function listCollectionIds(docName) {
  const ids = []
  let pageToken
  do {
    const j = await call(`https://firestore.googleapis.com/v1/${docName}:listCollectionIds`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageSize: 100, ...(pageToken ? { pageToken } : {}) }),
    })
    ids.push(...(j.collectionIds ?? []))
    pageToken = j.nextPageToken
  } while (pageToken)
  return ids
}

/** Every doc name in the tree rooted at `docName` (descendants first). */
async function collectTree(docName) {
  const out = []
  for (const coll of await listCollectionIds(docName)) {
    const rel = `${docName.slice(DB.length + 1)}/${coll}`
    for (const child of await listDocNames(rel)) out.push(...(await collectTree(child)))
  }
  out.push(docName)
  return out
}

async function deleteDocs(names) {
  for (let i = 0; i < names.length; i += COMMIT_BATCH) {
    await call(`${FS}:commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ writes: names.slice(i, i + COMMIT_BATCH).map((n) => ({ delete: n })) }),
    })
  }
}

// ── run ──────────────────────────────────────────────────────────────────
const main = async () => {
  console.log(`\nProject: ${PROJECT}\nMode:    ${doWrite ? 'WRITE (erasing orphans)' : 'DRY RUN (no changes)'}\n`)

  const authUids = await listAuthUids()
  const userDocs = await listDocNames('users')
  const uidOf = (name) => name.split('/').pop()
  const orphans = userDocs.map(uidOf).filter((uid) => !authUids.has(uid))

  console.log(`Auth accounts:            ${authUids.size}`)
  console.log(`users/{uid} trees:        ${userDocs.length}`)
  console.log(`Orphaned (no auth user):  ${orphans.length}\n`)

  if (authUids.size === 0) throw new Error('Auth listed ZERO users — refusing (listing/auth failure?).')
  if (userDocs.length > 0 && orphans.length / userDocs.length > MAX_ORPHAN_SHARE && !allowMany) {
    throw new Error(
      `${orphans.length}/${userDocs.length} trees look orphaned (> ${MAX_ORPHAN_SHARE * 100}%) — ` +
        'refusing. Verify the Auth count above, then re-run with --allow-many if it is real.',
    )
  }
  if (orphans.length === 0) {
    console.log('Nothing to erase.\n')
    return
  }

  let erasedTrees = 0
  let erasedDocs = 0
  for (const uid of orphans) {
    const tree = await collectTree(`${DB}/users/${uid}`)
    const label = tree.map((n) => n.slice(`${DB}/users/${uid}/`.length) || '(root)').join(', ')
    if (!doWrite) {
      console.log(`  ${uid}  ${tree.length} docs  [${label}]`)
      continue
    }
    // Second, independent check right before the irreversible delete.
    if (await authUserExists(uid)) {
      console.log(`  SKIP ${uid} — auth user exists now (signed up / restored since listing)`)
      continue
    }
    await deleteDocs(tree)
    erasedTrees++
    erasedDocs += tree.length
    console.log(`  erased ${uid}  (${tree.length} docs)`)
  }

  if (!doWrite) {
    console.log('\nDRY RUN — nothing deleted. Check the list, then re-run with --write.\n')
  } else {
    console.log(`\nDone. Erased ${erasedTrees} orphaned trees (${erasedDocs} docs).\n`)
  }
}

main().catch((e) => {
  console.error('\nFAILED:', e.message)
  process.exit(1)
})
