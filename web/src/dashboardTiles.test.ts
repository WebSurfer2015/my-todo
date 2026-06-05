import { describe, it, expect } from 'vitest'
import { effectiveDashboardTiles, dashboardTileKey } from '../../core/src/logic/filters'

/** Unified Dashboard card list: stored order reconciled against live pins. */
describe('effectiveDashboardTiles', () => {
  it('no stored order → pins in natural order (todos, stores, depts)', () => {
    const out = effectiveDashboardTiles({
      pinnedFilters: [['open'], ['pri:high', 'cat:home']],
      pinnedGroceryStores: ['Costco'],
      pinnedGroceryDepts: ['produce'],
    })
    expect(out.map(dashboardTileKey)).toEqual([
      'f:open',
      'f:cat:home pri:high',
      's:Costco',
      'd:produce',
    ])
  })

  it('respects stored drag order', () => {
    const out = effectiveDashboardTiles({
      dashboardTiles: [
        { kind: 'groceryStore', store: 'Costco' },
        { kind: 'todoFilter', set: ['open'] },
      ],
      pinnedFilters: [['open']],
      pinnedGroceryStores: ['Costco'],
    })
    expect(out.map(dashboardTileKey)).toEqual(['s:Costco', 'f:open'])
  })

  it('drops a tile whose pin was removed + appends a new pin', () => {
    const out = effectiveDashboardTiles({
      // stored order had Costco first, then open; Costco unpinned, TJ added
      dashboardTiles: [
        { kind: 'groceryStore', store: 'Costco' },
        { kind: 'todoFilter', set: ['open'] },
      ],
      pinnedFilters: [['open']],
      pinnedGroceryStores: ['Trader Joe\'s'],
    })
    expect(out.map(dashboardTileKey)).toEqual(['f:open', "s:Trader Joe's"])
  })
})
