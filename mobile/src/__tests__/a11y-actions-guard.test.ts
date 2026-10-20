/**
 * Source guards for wiring the .tsx coverage can't render (RN is stubbed):
 *   - pill VoiceOver actions: FilterBar's saved pills offer Pin + Remove,
 *     StorePill offers Pin — each routed to the same handler a tap uses
 *   - Ask Mochi's chat is keyed on the account, so an account switch starts
 *     a fresh conversation (SheetProvider sits above AppGate)
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const read = (rel: string) => readFileSync(join(here, '..', rel), 'utf8')

describe('pill a11y actions (source guard)', () => {
  it('FilterBar pills declare pin + remove, routed to onPinFilter / removePill', () => {
    const src = read('features/filters/FilterBar.tsx')
    expect(src).toMatch(/accessibilityActions=\{\[\s*\{ name: 'pin',[^}]*\},\s*\{ name: 'remove',/)
    expect(src).toMatch(/actionName === 'pin'\) onPinFilter\(set\)/)
    expect(src).toMatch(/actionName === 'remove'\) removePill\(set\)/)
  })

  it('StorePill declares pin, routed to onTogglePin', () => {
    const src = read('features/groceries/GroceryView/StorePill.tsx')
    expect(src).toMatch(/accessibilityActions=\{onTogglePin \? \[\{ name: "pin",/)
    expect(src).toMatch(/actionName === "pin"\) onTogglePin\(\)/)
  })
})

describe('Ask Mochi conversation is per account (source guard)', () => {
  it('SheetProvider keys ChatSheet on the account uid', () => {
    const src = read('app/SheetContext.tsx')
    const tag = /<ChatSheet\b[\s\S]*?>/.exec(src)?.[0] ?? ''
    expect(tag).toMatch(/\bkey=\{accountUid \?\? 'signed-out'\}/)
  })

  it('the re-keyed chat never mounts visible for a different account than it was opened for', () => {
    const src = read('app/SheetContext.tsx')
    const tag = /<ChatSheet\b[\s\S]*?>/.exec(src)?.[0] ?? ''
    expect(tag).toMatch(/visible=\{mochiOpen && mochiOpenedFor === accountUid\}/)
    // Every open goes through showMochi (which records the account).
    expect(src).not.toMatch(/setMochiOpen\(true\)[\s\S]*setMochiOpen\(true\)/)
    expect(src).toMatch(/setMochiOpenedFor\(accountUid\)\s*\n\s*setMochiOpen\(true\)/)
  })

  it("the account reset also drops the previous account's seed and auto-send", () => {
    const src = read('app/SheetContext.tsx')
    const reset = /useEffect\(\(\) => \{\s*setProfileOpen\(false\)[\s\S]*?\}, \[accountUid, dismissSnackbar\]\)/.exec(src)?.[0] ?? ''
    expect(reset).toMatch(/setMochiSeed\(''\)/)
    expect(reset).toMatch(/setMochiAutoSend\(false\)/)
  })
})

describe('voice status note placement (source guard)', () => {
  it('renders the Listening / missed / denied note ABOVE the input row (below it the keyboard hides it)', () => {
    const src = readFileSync(join(__dirname, '../features/mochi/ChatSheet.tsx'), 'utf8')
    const note = src.indexOf("speech.status === 'listening' && (")
    const row = src.indexOf('<View style={styles.inputRow}>')
    expect(note).toBeGreaterThan(-1)
    expect(row).toBeGreaterThan(-1)
    expect(note).toBeLessThan(row)
  })
})
