/**
 * Undo for "Linked N items to <store>." (pure, unit-tested): Mochi tagged
 * some shopping items with a newly added store; Undo takes that store tag
 * back off exactly the items it was added to — items that already carried
 * the tag, or were deleted since, are left alone.
 */
interface StoreTagged {
  id: string
  stores: string[]
}

/** The ids the link will actually tag (they exist and don't carry it yet). */
export function newlyLinkedIds(items: ReadonlyArray<StoreTagged>, storeName: string, ids: ReadonlyArray<string>): string[] {
  const want = new Set(ids)
  return items.filter((it) => want.has(it.id) && !it.stores.includes(storeName)).map((it) => it.id)
}

/** Per-item `stores` patches that remove the tag again (current items). */
export function unlinkPatches(
  items: ReadonlyArray<StoreTagged>,
  storeName: string,
  linkedIds: ReadonlyArray<string>,
): Array<{ id: string; stores: string[] }> {
  const linked = new Set(linkedIds)
  return items
    .filter((it) => linked.has(it.id) && it.stores.includes(storeName))
    .map((it) => ({ id: it.id, stores: it.stores.filter((s) => s !== storeName) }))
}

/** The link result line: how many items it actually tagged (an AI match of
 * items already tagged links nothing new — no Undo then). */
export function linkResultMessage(linked: number, storeName: string): string {
  if (linked <= 0) return `No new items to link to ${storeName}.`
  return `Linked ${linked} ${linked === 1 ? 'item' : 'items'} to ${storeName}.`
}

/** The AI link lands only while the store still exists (it may have been
 * renamed / deleted while Mochi was matching). */
export function isStoreStillListed(stores: ReadonlyArray<string>, storeName: string): boolean {
  return stores.includes(storeName)
}
