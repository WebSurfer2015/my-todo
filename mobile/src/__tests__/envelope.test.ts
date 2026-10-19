import { describe, it, expect } from 'vitest'
import { wrap, unwrap, serializeAny } from '../storage/envelope'

/**
 * The versioned envelope is the cross-device persistence contract — the
 * SAME { version, data } shape (core wrapEnvelope) is every Firestore state
 * doc's value and the device-local setting's, so a drift here silently
 * breaks sync. These pin the byte shape + the round-trip + the
 * non-envelope/garbage fallbacks.
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

  it('unwrap treats a bare (un-enveloped) JSON value as empty', () => {
    expect(unwrap('[1,2,3]')).toBeNull()
    expect(unwrap('{"foo":"bar"}')).toBeNull()
  })

  it('does not treat an array as an envelope', () => {
    expect(unwrap('[{"version":1,"data":9}]')).toBeNull()
  })

  it('rejects an envelope whose version is not a number', () => {
    expect(unwrap('{"version":"1","data":[1]}')).toBeNull()
  })
})
