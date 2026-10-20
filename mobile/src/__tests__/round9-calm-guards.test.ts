/**
 * Round-9 calm / visibility fixes (source guards — RN UI isn't rendered in
 * vitest):
 *   - CategorySheet shows a category delete's Undo and the pin cap INLINE
 *     (a snackbar would sit behind its Modal)
 *   - Home: a returning user who finished everything gets a quiet day, not
 *     the first-day welcome
 *   - VoiceOver never speaks a hidden carried-over count
 *   - white-on-red text uses theme.onDanger; Mochi's shopping removal is a
 *     neutral button (it has an Undo)
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const read = (rel: string) => readFileSync(join(here, '..', rel), 'utf8')

describe('CategorySheet inline notices', () => {
  const sheet = read('features/category/CategorySheet/index.tsx')
  const ctx = read('app/SheetContext.tsx')

  it('category delete returns its message + Undo instead of a snackbar', () => {
    const fn = /const deleteCategoryWithUndo = useCallback\([\s\S]*?\}, \[\]\)/.exec(ctx)?.[0] ?? ''
    expect(fn).toMatch(/return undo \? \{ message: categoryDeletedMessage\(moved\), undo \} : null/)
    expect(fn).not.toMatch(/showSnackbar/)
  })

  it('the sheet returns to the list and shows the notice with its Undo', () => {
    expect(sheet).toMatch(/const res = onDelete\(c\.id\);\s*[\s\S]*?setMode\(\{ kind: "edit" \}\);\s*setNotice\(res\);/)
    expect(sheet).toMatch(/\{notice && \(/)
    expect(sheet).toMatch(/notice\.undo && \(/)
  })

  it('a pin past the cap is said inline and not sent to the store', () => {
    expect(sheet).toMatch(/pinnedFilters\.length >= PIN_LIMIT\) \{\s*setNotice\(\{ message: t\.pinCapReached\(PIN_LIMIT\), undo: null \}\);\s*return;/)
    expect(sheet).not.toMatch(/onPress=\{\(\) => onPinFilter\(/)
  })
})

describe('Home empty state', () => {
  const home = read('features/home/HomeScreen.tsx')
  it('a returning user with finished work gets a quiet day', () => {
    expect(home).toMatch(/const hasDone = store\.todos\.some\(\(td\) => td\.done \|\| td\.trashed\)/)
    expect(home).toMatch(/'A quiet day\. Nothing on your plate\.'/)
    expect(home).toMatch(/'What you finished is resting in Done\.'/)
  })
  it('the carried-over header never speaks a count', () => {
    expect(home).toMatch(/accessibilityLabel="Open Todos at Carried over"/)
    expect(home).not.toMatch(/carriedOverItems\.length\} carried over/)
  })
})

describe('Defer-all labels never count', () => {
  const app = readFileSync(join(here, '..', '..', 'App.tsx'), 'utf8')
  it('says "all" instead of a number', () => {
    expect(app).toMatch(/accessibilityLabel="Defer all carried-over to-dos"/)
    expect(app).toMatch(/accessibilityLabel=\{`Defer all to-dos in \$\{headerLabel\}`\}/)
    expect(app).not.toMatch(/Defer \$\{/)
  })
  it('"Delete all permanently" text reads on red in dark mode', () => {
    expect(app).toMatch(/emptyTrashText: \{\s*color: c\.onDanger,/)
  })
})

describe('Mochi shopping removal', () => {
  const chat = read('features/mochi/ChatSheet.tsx')
  it('is a neutral button (it has an inline Undo); no hardcoded white-on-red', () => {
    expect(chat).toMatch(/\{ label: 'Remove from shopping', tone: 'neutral' as const \}/)
    expect(chat).not.toMatch(/btnDanger/)
    expect(chat).not.toMatch(/'#FFFFFF'/)
  })
})
