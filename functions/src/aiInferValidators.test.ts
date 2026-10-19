/**
 * Table tests for the aiInfer input validators — the prompt-size bounds an
 * untrusted client can't exceed (item / department / store counts and
 * per-field length caps). Each validator throws invalid-argument BEFORE the
 * quota reserve, so these caps are also what keeps junk from burning a slot.
 */
import { describe, expect, it } from 'vitest'
import { validateBreakdownInput } from './aiInferBreakdown'
import { validateClassifyDeptInput } from './aiInferClassifyDept'
import { validateLinkStoreInput } from './aiInferLinkStore'

const items = (n: number, f: (i: number) => unknown = (i) => ({ id: `id${i}`, text: `item ${i}` })) =>
  Array.from({ length: n }, (_, i) => f(i))
const depts = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `d${i}`, label: `Dept ${i}` }))

describe('validateBreakdownInput', () => {
  it.each([
    ['no input', undefined],
    ['non-object', 'title'],
    ['missing title', {}],
    ['blank title', { title: '   ' }],
    ['non-string title', { title: 7 }],
    ['title over 200 chars', { title: 'x'.repeat(201) }],
    ['notes over 1000 chars', { title: 't', notes: 'n'.repeat(1001) }],
    ['non-string notes', { title: 't', notes: 5 }],
  ])('rejects %s', (_label, raw) => {
    expect(() => validateBreakdownInput(raw)).toThrow(expect.objectContaining({ code: 'invalid-argument' }))
  })
  it('accepts exactly-at-cap values and trims', () => {
    expect(validateBreakdownInput({ title: ` ${'x'.repeat(198)} `, notes: 'n'.repeat(1000) })).toEqual({
      title: 'x'.repeat(198),
      notes: 'n'.repeat(1000),
    })
    expect(validateBreakdownInput({ title: 'Plan trip' })).toEqual({ title: 'Plan trip', notes: undefined })
  })
})

describe('validateLinkStoreInput', () => {
  it.each([
    ['no input', null],
    ['missing storeName', { items: [] }],
    ['blank storeName', { storeName: '  ', items: [] }],
    ['storeName over 64', { storeName: 's'.repeat(65), items: [] }],
    ['items not an array', { storeName: 'Costco', items: 'milk' }],
  ])('rejects %s', (_label, raw) => {
    expect(() => validateLinkStoreInput(raw)).toThrow(expect.objectContaining({ code: 'invalid-argument' }))
  })
  it('caps the item list at 50', () => {
    const out = validateLinkStoreInput({ storeName: 'Costco', items: items(80) })
    expect(out.items).toHaveLength(50)
    expect(out.items[49]).toEqual({ id: 'id49', text: 'item 49' })
  })
  it('drops bad / over-long ids, blank text, and duplicates; truncates text to 120', () => {
    const out = validateLinkStoreInput({
      storeName: ' Costco ',
      items: [
        null,
        { id: '', text: 'x' },
        { id: 'i'.repeat(65), text: 'x' },
        { id: 'i'.repeat(64), text: 'ok' },
        { id: 'a', text: '   ' },
        { id: 'a', text: 't'.repeat(200) },
        { id: 'a', text: 'dup' },
        { id: 7, text: 'x' },
      ],
    })
    expect(out.storeName).toBe('Costco')
    expect(out.items).toEqual([
      { id: 'i'.repeat(64), text: 'ok' },
      { id: 'a', text: 't'.repeat(120) },
    ])
  })
})

describe('validateClassifyDeptInput', () => {
  it.each([
    ['no input', undefined],
    ['blank text', { text: ' ', departments: depts(1) }],
    ['text over 200', { text: 'x'.repeat(201), departments: depts(1) }],
    ['missing departments', { text: 'milk' }],
    ['empty departments', { text: 'milk', departments: [] }],
    ['no valid departments', { text: 'milk', departments: [{ id: '', label: 'x' }, { id: 'a', label: '' }, null] }],
  ])('rejects %s', (_label, raw) => {
    expect(() => validateClassifyDeptInput(raw)).toThrow(expect.objectContaining({ code: 'invalid-argument' }))
  })
  it('caps departments at 30 and labels at 40 chars; drops over-long ids', () => {
    const out = validateClassifyDeptInput({
      text: ' milk ',
      departments: [{ id: 'x'.repeat(65), label: 'too long id' }, { id: 'long', label: 'L'.repeat(60) }, ...depts(40)],
    })
    expect(out.text).toBe('milk')
    expect(out.departments).toHaveLength(29) // 30 sliced, the over-long id dropped
    expect(out.departments[0]).toEqual({ id: 'long', label: 'L'.repeat(40) })
  })
  it('caps stores at 30, drops blank / non-string / over-64 names; stores optional', () => {
    const stores = ['', '  ', 7, 's'.repeat(65), 's'.repeat(64), ...Array.from({ length: 40 }, (_, i) => `Store ${i}`)]
    const out = validateClassifyDeptInput({ text: 'milk', departments: depts(1), stores })
    // First 30 entries considered: 5 junk-or-edge + 25 real; 4 of the 5 are junk.
    expect(out.stores).toHaveLength(26)
    expect(out.stores[0]).toBe('s'.repeat(64))
    expect(validateClassifyDeptInput({ text: 'milk', departments: depts(1) }).stores).toEqual([])
  })
})
