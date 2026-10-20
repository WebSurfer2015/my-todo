/**
 * UX-review fixes for Ask Mochi + Shopping: the autosaving grocery edit
 * session, the store filter's "Other stores" split, the voice copy, and
 * source guards for wiring the RN stub can't render.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  groceryEditChanged,
  groceryEditSnapshot,
  groceryEditText,
  groceryEditToggleStore,
} from '../features/groceries/groceryEditSession'
import { splitStoresByCount } from '../features/groceries/StorePicker/storeSplit'
import { SPEECH_COPY } from '../features/mochi/speechInput'

const here = dirname(fileURLToPath(import.meta.url))
const read = (rel: string) => readFileSync(join(here, '..', rel), 'utf8')

describe('grocery edit session (autosave + Undo)', () => {
  const item = { text: 'Bagels', groupId: 'bakery', stores: ['Costco'] }

  it('snapshots the editable fields, detached from the item', () => {
    const snap = groceryEditSnapshot(item)
    expect(snap).toEqual(item)
    expect(snap.stores).not.toBe(item.stores)
  })

  it('a blanked name keeps the old one; a typed one is trimmed', () => {
    expect(groceryEditText('   ', 'Bagels')).toBe('Bagels')
    expect(groceryEditText('  Rye bread ', 'Bagels')).toBe('Rye bread')
  })

  it('reports a change in any field, and none when nothing moved', () => {
    expect(groceryEditChanged(item, { ...item })).toBe(false)
    expect(groceryEditChanged(item, { ...item, text: 'Rye' })).toBe(true)
    expect(groceryEditChanged(item, { ...item, groupId: 'pantry' })).toBe(true)
    expect(groceryEditChanged(item, { ...item, stores: [] })).toBe(true)
    expect(groceryEditChanged(item, { ...item, stores: ['CVS'] })).toBe(true)
    // Toggled off and back on: same list again → nothing to undo.
    const back = groceryEditToggleStore(groceryEditToggleStore(item.stores, 'Costco'), 'Costco')
    expect(groceryEditChanged(item, { ...item, stores: back })).toBe(false)
  })

  it('toggles a store in / out (appending when added)', () => {
    expect(groceryEditToggleStore(['Costco'], 'CVS')).toEqual(['Costco', 'CVS'])
    expect(groceryEditToggleStore(['Costco', 'CVS'], 'Costco')).toEqual(['CVS'])
  })
})

describe('store filter split', () => {
  const counts = new Map([
    ['Costco', 0],
    ['CVS', 3],
    ['Trader Joe\'s', 0],
  ])
  it('folds stores with nothing on the list under Other stores, in order', () => {
    expect(splitStoresByCount(['Stop & Shop', 'Costco', 'CVS', 'Trader Joe\'s'], counts, undefined)).toEqual({
      withItems: ['CVS'],
      empty: ['Stop & Shop', 'Costco', 'Trader Joe\'s'],
    })
  })
  it('keeps the active store in view even when it has nothing', () => {
    expect(splitStoresByCount(['Costco', 'CVS'], counts, 'Costco')).toEqual({
      withItems: ['Costco', 'CVS'],
      empty: [],
    })
  })
})

describe('Ask Mochi voice copy', () => {
  it('tells the user how to stop, and VoiceOver names the Stop control', () => {
    expect(SPEECH_COPY.listening).toBe('Listening… tap ■ to stop')
    expect(SPEECH_COPY.listeningA11y.startsWith('Listening…')).toBe(true)
    expect(SPEECH_COPY.listeningA11y).toContain(SPEECH_COPY.stopLabel)
  })
})

describe('source guards', () => {
  it('Ask Mochi: VoiceOver name matches the visible "Enter manually instead"', () => {
    const chat = read('features/mochi/ChatSheet.tsx')
    expect(chat).toMatch(/accessibilityLabel="Enter manually instead"/)
    expect(chat).not.toMatch(/Switch to entering/)
  })

  it('Ask Mochi: placeholder no longer repeats a chip; no extra sparkle above the greeting', () => {
    const chat = read('features/mochi/ChatSheet.tsx')
    expect(chat).toMatch(/'Type or tap the mic…'/)
    expect(chat).toMatch(/"Type what's on your mind…"/)
    expect(chat).not.toMatch(/PLACEHOLDER_EXAMPLES/)
    expect(chat).not.toMatch(/BreathingSparkle/)
  })

  it('Ask Mochi: the listening pulse is skipped under Reduce Motion', () => {
    const chat = read('features/mochi/ChatSheet.tsx')
    expect(chat).toMatch(/const still = reduceMotion \|\| osReduceMotion/)
    expect(chat).toMatch(/if \(!listening \|\| still\) return/)
  })

  it('Maestro flows tap the visible "Enter manually instead"', () => {
    for (const f of ['02-add-todo.yaml', '12-todos-empty-state.yaml']) {
      const flow = read(`../.maestro/flows/${f}`)
      expect(flow).toMatch(/tapOn: "Enter manually instead"/)
    }
  })

  it('Shopping: "Bought recently" replaces Saved / Past items', () => {
    const view = read('features/groceries/GroceryView/index.tsx')
    const edit = read('features/groceries/GroceryEditSheet.tsx')
    expect(view).toMatch(/BOUGHT RECENTLY/)
    expect(view).not.toMatch(/>\s*SAVED\s*</)
    expect(view).not.toMatch(/Past items/)
    expect(edit).toMatch(/rest in Bought recently/)
  })

  it('Shopping: the store filter matches the Todos filter (Filter · Reset · Show results · All)', () => {
    const picker = read('features/groceries/StorePicker/index.tsx')
    expect(picker).toMatch(/editing \? "Shopping stores" : "Filter"/)
    expect(picker).toMatch(/left=\{editing \? undefined : null\}/)
    expect(picker).toMatch(/label: "Reset"/)
    expect(picker).toMatch(/Show results/)
    expect(picker).toMatch(/>All</)
    expect(picker).not.toMatch(/>Any</)
    expect(picker).toMatch(/Other stores/)
  })

  it('Shopping: the edit sheet autosaves — Close, no Save / Cancel', () => {
    const edit = read('features/groceries/GroceryEditSheet.tsx')
    expect(edit).toMatch(/left=\{null\}/)
    expect(edit).toMatch(/primary=\{\{ label: 'Close', onPress: handleClose \}\}/)
    expect(edit).not.toMatch(/t\.save/)
    expect(edit).toMatch(/message: t\.changesSaved/)
    expect(edit).toMatch(/>ITEM</)
    expect(edit).toMatch(/>DEPARTMENT</)
    expect(edit).toMatch(/>STORES</)
  })
})
