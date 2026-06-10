import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

/**
 * Drift guard for the hand-duplicated tier limits.
 *
 * core/src/domain/entitlements.ts is the source of truth (client UI gates
 * + display). web/functions/src/entitlements.ts mirrors TIER_LIMITS for
 * server-side AI-allowance enforcement — the functions package can't
 * import core/ (separate tsconfig, deployed standalone), so the values are
 * copied. If they drift, a user's displayed allowance and their enforced
 * allowance disagree (and we could under- or over-charge AI). This reads
 * both files and asserts the TIER_LIMITS literal is identical.
 */

const CORE = resolve(__dirname, '../../../core/src/domain/entitlements.ts')
const SERVER = resolve(__dirname, '../../../web/functions/src/entitlements.ts')

/** Extract the `TIER_LIMITS` object literal and strip whitespace so
 * formatting differences don't false-positive — only keys + values
 * (in the same order, which both files share) matter. */
function extractLimits(src: string): string {
  const marker = 'TIER_LIMITS: Record<Tier, TierLimits> = {'
  const start = src.indexOf(marker)
  if (start < 0) throw new Error('TIER_LIMITS literal not found')
  const braceStart = start + marker.length - 1
  let depth = 0
  for (let i = braceStart; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') {
      depth--
      if (depth === 0) {
        return src.slice(braceStart, i + 1).replace(/\s+/g, '')
      }
    }
  }
  throw new Error('Unbalanced braces in TIER_LIMITS')
}

describe('TIER_LIMITS core↔server parity', () => {
  it('the limits literal is identical in core and the Cloud Function', () => {
    const core = extractLimits(readFileSync(CORE, 'utf8'))
    const server = extractLimits(readFileSync(SERVER, 'utf8'))
    expect(server).toEqual(core)
  })
})
