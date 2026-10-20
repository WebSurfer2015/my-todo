/**
 * The store filter's two tiers: stores with something on the list stay in
 * view; stores with nothing there fold under "Other stores" — except the
 * active one, which always stays visible so its checkmark never hides.
 * Order within each tier follows the user's store order.
 */
export function splitStoresByCount(
  stores: string[],
  counts: Map<string, number>,
  activeStore: string | undefined,
): { withItems: string[]; empty: string[] } {
  const withItems: string[] = []
  const empty: string[] = []
  for (const s of stores) {
    if ((counts.get(s) ?? 0) > 0 || s === activeStore) withItems.push(s)
    else empty.push(s)
  }
  return { withItems, empty }
}
