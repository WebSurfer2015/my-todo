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
})
