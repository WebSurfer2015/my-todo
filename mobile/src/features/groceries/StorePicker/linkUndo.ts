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
