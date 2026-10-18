/**
 * Account-deletion erasure — the authoritative wipe of a user's Firestore data.
 *
 * Fires on Firebase Auth user deletion (in-app "Delete account" on mobile/web,
 * or a Console/admin delete) and recursively deletes the whole users/{uid}
 * tree: every state doc (client-owned todos/profile/… AND the function-only
 * agentUsage / mochiUsage / entitlement / rcWebhook), devices/*, and the
 * per-item collections.
 *
 * Why server-side: firestore.rules denies client deletes on state docs
 * (`allow delete: if false`) and never lets clients touch the function-only
 * keys, so the client-side "wipe then delete auth user" in runDeleteAccount
 * cannot erase anything on its own. The admin SDK bypasses rules.
 *
 * Gen-1 trigger on purpose: v2 has no auth-onDelete event (only blocking
 * functions, which don't fire on delete).
 */

import * as functions from 'firebase-functions/v1'
import * as admin from 'firebase-admin'

if (admin.apps.length === 0) admin.initializeApp()

/** Minimal surface of Firestore this needs — lets tests pass a fake. */
export interface RecursiveDeleter {
  doc(path: string): unknown
  recursiveDelete(ref: never): Promise<void>
}

/** Firebase uids are 1–128 chars with no '/'. Anything else is refused so a
 * malformed value can never widen the delete beyond one user's subtree. */
export function isSafeUid(uid: unknown): uid is string {
  return typeof uid === 'string' && uid.length > 0 && uid.length <= 128 && !uid.includes('/')
}

/** Recursively delete users/{uid} and everything under it. */
export async function deleteUserTree(db: RecursiveDeleter, uid: string): Promise<void> {
  if (!isSafeUid(uid)) throw new Error(`refusing to delete unsafe uid: ${JSON.stringify(uid)}`)
  await db.recursiveDelete(db.doc(`users/${uid}`) as never)
}

// Pinned to us-central1 with every other function (gen-1 otherwise picks up a
// default region — it landed in us-east1 on first deploy).
export const onUserDeleted = functions
  .region('us-central1')
  .auth.user()
  .onDelete(async (user) => {
    // Throwing lets Cloud Functions log the failure; recursiveDelete is
    // idempotent, so a manual re-run (or retry) is safe.
    await deleteUserTree(admin.firestore() as unknown as RecursiveDeleter, user.uid)
    console.log('onUserDeleted: erased users/{uid} tree')
  })
