import { describe, it, expect } from 'vitest'
import { isCompName } from '../functions/src/compUsers'

describe('isCompName — comp allowlist', () => {
  it('matches listed family by first + last, case/whitespace-insensitive', () => {
    expect(isCompName('Joanna', 'Zhou')).toBe(true)
    expect(isCompName('  helen ', 'ZHOU')).toBe(true)
    expect(isCompName('Sydney', 'Zhou')).toBe(true)
    expect(isCompName('Ying', 'Qin')).toBe(true)
  })
  it('does not match a partial, swapped, or unlisted name', () => {
    expect(isCompName('Joanna', 'Smith')).toBe(false) // wrong last
    expect(isCompName('Zhou', 'Joanna')).toBe(false) // swapped
    expect(isCompName('Random', 'Person')).toBe(false)
    expect(isCompName('Joanna', '')).toBe(false) // last name required
    expect(isCompName('', '')).toBe(false)
  })
})
