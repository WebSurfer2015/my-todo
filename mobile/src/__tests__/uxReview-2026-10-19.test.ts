/**
 * Source guards for the 2026-10-19 UX-review fixes whose UI can't render
 * under the RN stub (device QA covers the visuals).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const read = (rel: string) => readFileSync(join(here, '..', rel), 'utf8')

describe('1 — one row-tap model on Shopping rows', () => {
  const row = read('features/groceries/GroceryView/Row.tsx')
  const screen = read('features/groceries/GroceriesScreen.tsx')

  it('the row body opens the item; only the circle checks it off', () => {
    const body = /style=\{styles\.rowBody\}[\s\S]*?>/.exec(row)?.[0] ?? ''
    expect(body).toMatch(/onPress=\{handleOpenEdit\}/)
    expect(body).not.toMatch(/onPress=\{handleToggle\}/)
    // No trailing chevron — same as a to-do row.
    expect(row).not.toMatch(/rowEditChevron|›/)
  })

  it('a check-off says "Got <item>." with an Undo', () => {
    expect(screen).toMatch(/checkOffGrocery\(id\)/)
    expect(screen).toMatch(/message: `Got \$\{item\.text\}\.`, actionLabel: 'Undo'/)
  })
})

describe('4 — Filters & categories: no trash on rows', () => {
  const sheet = read('features/category/CategorySheet/index.tsx')

  it('rows carry no trash or eye control; Delete lives in the edit form', () => {
    expect(sheet).not.toMatch(/Trash2|EyeOff|\bEye\b/)
    expect(sheet).toMatch(/startEditCategory\(c\)/)
    expect(sheet).toMatch(/styles\.editCatDeleteBtn/)
  })

  it('the sheet and the Settings row are titled "Filters & categories"', () => {
    expect(sheet).toMatch(/t\.filtersAndCategories/)
    expect(read('features/profile/SettingsSheet.tsx')).toMatch(/\{t\.filtersAndCategories\}/)
  })
})

describe('7 — Mochi card Undo targets', () => {
  const card = read('features/mochi/EditableCaptureCard.tsx')
  const chat = read('features/mochi/ChatSheet.tsx')

  it('every Undo is a 44pt target', () => {
    expect(card).toMatch(/undoBtn: \{ minHeight: 44/)
    expect(chat).toMatch(/undoBtn: \{ minHeight: 44/)
    const undoTouchables = chat.match(/<TouchableOpacity\n(?:(?!<TouchableOpacity)[\s\S])*?<Text style=\{styles\.undoText\}>Undo<\/Text>/g) ?? []
    expect(undoTouchables.length).toBe(3)
    for (const u of undoTouchables) expect(u).toMatch(/style=\{styles\.undoBtn\}/)
  })

  it('the capture card says "Undo change" while edits remain, then "Remove"', () => {
    expect(card).toMatch(/hasChipEdits \? 'Undo change' : 'Remove'/)
    expect(card).toMatch(/hasChipEdits \? 'Undo last change' : 'Remove this to-do'/)
  })
})

describe('8 — details header says Close', () => {
  it('uses t.close, not t.done, for the header button', () => {
    const details = read('features/task/TaskDetailsSheet/index.tsx')
    expect(details).toMatch(/onPress=\{closeAndFlushText\}[\s\S]{0,200}accessibilityLabel=\{t\.close\}/)
  })
})
