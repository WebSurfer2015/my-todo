import { describe, it, expect } from 'vitest'
import { strings } from '../../core/src/i18n'

/**
 * Recursively collect every key path under an object. Functions are leaf nodes
 * (we treat them as a key with no further children). Arrays are leaves too.
 */
function collectPaths(obj: unknown, prefix = ''): string[] {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj) || typeof obj === 'function') {
    return [prefix]
  }
  const out: string[] = []
  for (const k of Object.keys(obj as Record<string, unknown>).sort()) {
    const next = prefix ? `${prefix}.${k}` : k
    out.push(...collectPaths((obj as Record<string, unknown>)[k], next))
  }
  return out
}

describe('i18n parity', () => {
  it('zh has every key that en has (no missing translations)', () => {
    const enKeys = new Set(collectPaths(strings.en))
    const zhKeys = new Set(collectPaths(strings.zh))
    const missingInZh: string[] = []
    for (const k of enKeys) if (!zhKeys.has(k)) missingInZh.push(k)
    expect(missingInZh).toEqual([])
  })

  it('zh has no extra keys not in en (would be silently unused)', () => {
    const enKeys = new Set(collectPaths(strings.en))
    const zhKeys = new Set(collectPaths(strings.zh))
    const extraInZh: string[] = []
    for (const k of zhKeys) if (!enKeys.has(k)) extraInZh.push(k)
    expect(extraInZh).toEqual([])
  })
})
