import { describe, it, expect } from 'vitest'
import { wrap, unwrap, serializeAny } from '../storage/envelope'

/**
 * The versioned envelope is the cross-device persistence contract — the
 * SAME { version, data } shape is written by AsyncStorage (local) and
 * Firestore (cloud), so a drift here silently breaks sync. These pin the
 * byte shape + the round-trip + the legacy/garbage fallbacks.
 */
describe('storage envelope', () => {
  it('wraps as {"version":1,"data":...} (byte shape shared with cloud)', () => {
    expect(wrap([{ id: 'a' }])).toBe('{"version":1,"data":[{"id":"a"}]}')
    expect(wrap(null)).toBe('{"version":1,"data":null}')
    expect(serializeAny(5)).toBe('{"version":1,"data":5}')
  })

  it('round-trips arrays, objects, and primitives', () => {
    for (const v of [[], [1, 2, 3], { a: 1 }, 'x', 0, true, null]) {
      expect(unwrap(wrap(v))).toEqual(v)
    }
  })

  it('unwrap returns null for null / invalid JSON', () => {
    expect(unwrap(null)).toBeNull()
    expect(unwrap('not json')).toBeNull()
    expect(unwrap('{bad')).toBeNull()
  })

  it('unwrap extracts .data from an enveloped value', () => {
    expect(unwrap('{"version":1,"data":[1,2]}')).toEqual([1, 2])
  })

  it('unwrap passes through a bare (legacy, un-enveloped) JSON value', () => {
    // Pre-envelope data was stored as the raw array/object — unwrap must
    // return it as-is so old installs still hydrate.
    expect(unwrap('[1,2,3]')).toEqual([1, 2, 3])
    expect(unwrap('{"foo":"bar"}')).toEqual({ foo: 'bar' })
  })

  it('treats an array as bare even though it is an object (not an envelope)', () => {
    // Arrays have no "version"/"data" keys → returned as-is, not unwrapped.
    expect(unwrap('[{"version":1,"data":9}]')).toEqual([{ version: 1, data: 9 }])
  })
})
