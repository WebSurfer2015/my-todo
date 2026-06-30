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
 * copied. If they drift, the webhook can write the wrong tier for a real
 * purchase (product-id mismatch → tierForProduct null → 'free'), fail to
 * credit a top-up (TOPUP_GRANTS miss), or a user's displayed vs enforced AI
 * allowance can disagree. This reads both files and asserts the TIER_LIMITS,
 * PRODUCT_IDS, and TOPUP_GRANTS literals are identical.
 */

const CORE = resolve(__dirname, '../../../core/src/domain/entitlements.ts')
const SERVER = resolve(__dirname, '../../../web/functions/src/entitlements.ts')

/** Extract the object literal that starts at `marker` (whose last char is the
 * opening `{`), then strip comments + whitespace so formatting/comment
 * differences don't false-positive — only keys + values (in the same order,
 * which both files share) matter. */
function extractLiteral(src: string, marker: string): string {
  const start = src.indexOf(marker)
  if (start < 0) throw new Error(`literal not found for marker: ${marker}`)
  const braceStart = start + marker.length - 1
  let depth = 0
  for (let i = braceStart; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') {
      depth--
      if (depth === 0) {
        return src
          .slice(braceStart, i + 1)
          .replace(/\/\*[\s\S]*?\*\//g, '') // block comments
          .replace(/\/\/[^\n]*/g, '') // line comments
          .replace(/\s+/g, '')
      }
    }
  }
  throw new Error(`Unbalanced braces for marker: ${marker}`)
}

describe('entitlements core↔server parity', () => {
  const core = readFileSync(CORE, 'utf8')
  const server = readFileSync(SERVER, 'utf8')

  it.each([
    ['TIER_LIMITS', 'TIER_LIMITS: Record<Tier, TierLimits> = {'],
    ['PRODUCT_IDS', 'PRODUCT_IDS = {'],
    ['TOPUP_GRANTS', 'TOPUP_GRANTS: Record<string, number> = {'],
  ])('%s literal is identical in core and the Cloud Function', (_name, marker) => {
    expect(extractLiteral(server, marker)).toEqual(extractLiteral(core, marker))
  })
})
