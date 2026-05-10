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
  const enKeys = new Set(collectPaths(strings.en))
  const otherLangs = (Object.keys(strings) as Array<keyof typeof strings>).filter(
    (l) => l !== 'en',
  )

  for (const lang of otherLangs) {
    it(`${lang} has every key that en has (no missing translations)`, () => {
      const langKeys = new Set(collectPaths(strings[lang]))
      const missing: string[] = []
      for (const k of enKeys) if (!langKeys.has(k)) missing.push(k)
      expect(missing, `Missing in ${lang}: ${missing.join(', ')}`).toEqual([])
    })

    it(`${lang} has no extra keys not in en (would be silently unused)`, () => {
      const langKeys = new Set(collectPaths(strings[lang]))
      const extra: string[] = []
      for (const k of langKeys) if (!enKeys.has(k)) extra.push(k)
      expect(extra, `Extra in ${lang}: ${extra.join(', ')}`).toEqual([])
    })
  }
})
