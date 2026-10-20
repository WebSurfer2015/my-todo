/**
 * Pure pieces of the autosaving grocery edit sheet: what the item looked like
 * when the sheet opened (the "Changes saved · Undo" target), the name a blank
 * field falls back to, and whether anything actually changed. No React here,
 * so they unit-test in plain node.
 */

/** The fields the edit sheet can change — and its Undo puts back. */
export interface GroceryEditFields {
  text: string
  groupId: string
  stores: string[]
}

export function groceryEditSnapshot(item: GroceryEditFields): GroceryEditFields {
  return { text: item.text, groupId: item.groupId, stores: [...item.stores] }
}

/** A grocery item can't be nameless: a blanked field keeps the old name. */
export function groceryEditText(draft: string, fallback: string): string {
  return draft.trim() || fallback
}

/** True when `after` differs from `before` in any editable field (store
 * order counts — it's what the user sees in the chip row). */
export function groceryEditChanged(before: GroceryEditFields, after: GroceryEditFields): boolean {
  return (
    before.text !== after.text ||
    before.groupId !== after.groupId ||
    before.stores.length !== after.stores.length ||
    before.stores.some((s, i) => s !== after.stores[i])
  )
}

/** Toggle one store in the item's list (append when added). */
export function groceryEditToggleStore(stores: string[], name: string): string[] {
  return stores.includes(name) ? stores.filter((s) => s !== name) : [...stores, name]
}
