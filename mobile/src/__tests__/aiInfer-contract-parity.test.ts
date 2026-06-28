import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

/**
 * Drift guard for the hand-duplicated aiInfer wire contract.
 *
 * The CLIENT contract lives in core/src/ports/aiContracts.ts (shared by
 * web + mobile). The SERVER owns its own copies in web/functions/src/
 * aiInfer*.ts because the functions package is deployed standalone with a
 * separate tsconfig and genuinely CANNOT import core/ — so the field shapes
 * are copied. If the server renames/adds/removes/re-optionalizes a field,
 * the client silently parses the old shape until something checks.
 *
 * This reads BOTH sides as text (an fs read, not an import — no arch-boundary
 * violation; test files are exempt anyway) and compares the STRUCTURE per
 * mode: the field-name + optionality set of each input/output interface. It
 * deliberately ignores field TYPES (so `Result` vs `Output` naming and
 * formatting/comments don't false-positive) — the real drift risk is an
 * added/removed/renamed/re-optionalized field.
 */

const CLIENT = resolve(__dirname, '../../../core/src/ports/aiContracts.ts')
const SRV = (f: string) => resolve(__dirname, `../../../web/functions/src/${f}`)

/** Extract the body of `interface <Name> { ... }` then return its sorted
 * top-level `name:` / `name?:` field set (ignoring nested braces). */
function ifaceFields(src: string, name: string): string[] {
  const re = new RegExp(`interface\\s+${name}\\s*\\{`)
  const m = re.exec(src)
  if (!m) throw new Error(`interface ${name} not found`)
  const braceStart = m.index + m[0].length - 1
  let depth = 0
  let end = braceStart
  for (let i = braceStart; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') {
      depth--
      if (depth === 0) {
        end = i
        break
      }
    }
  }
  return extractFields(src.slice(braceStart + 1, end))
}

/** Top-level `name:` / `name?:` identifiers, ignoring nested braces. */
function extractFields(bodyRaw: string): string[] {
  // Strip comments so their punctuation can't skew brace/paren depth.
  const body = bodyRaw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
  const fields: string[] = []
  let depth = 0
  let token = ''
  const flush = () => {
    const t = token.trim()
    token = ''
    const fm = t.match(/^(\w+)\s*(\??)\s*:/)
    if (fm) fields.push(fm[1] + (fm[2] ? '?' : ''))
  }
  for (const ch of body) {
    if (ch === '{' || ch === '<' || ch === '(') depth++
    else if (ch === '}' || ch === '>' || ch === ')') depth--
    if ((ch === ';' || ch === '\n' || ch === ',') && depth === 0) {
      flush()
      continue
    }
    token += ch
  }
  flush()
  return fields.sort()
}

const client = readFileSync(CLIENT, 'utf8')

// Per mode: [client input type, client result type, server file,
//            server input type, server output type].
const MODES: Array<[string, string, string, string, string, string]> = [
  ['breakdown-subtasks', 'BreakdownInput', 'BreakdownResult', 'aiInferBreakdown.ts', 'BreakdownInput', 'BreakdownOutput'],
  ['classify-grocery-dept', 'ClassifyDeptInput', 'ClassifyDeptResult', 'aiInferClassifyDept.ts', 'ClassifyDeptInput', 'ClassifyDeptOutput'],
  ['suggest-todo-fields', 'SuggestFieldsInput', 'SuggestFieldsResult', 'aiInferSuggestFields.ts', 'SuggestFieldsInput', 'SuggestFieldsOutput'],
  ['link-store-to-items', 'LinkStoreInput', 'LinkStoreResult', 'aiInferLinkStore.ts', 'LinkStoreInput', 'LinkStoreOutput'],
]

describe('aiInfer contract client↔server parity', () => {
  for (const [mode, cIn, cOut, file, sIn, sOut] of MODES) {
    const server = readFileSync(SRV(file), 'utf8')

    it(`${mode}: input field-shape matches`, () => {
      expect(ifaceFields(client, cIn)).toEqual(ifaceFields(server, sIn))
    })

    it(`${mode}: output field-shape matches`, () => {
      expect(ifaceFields(client, cOut)).toEqual(ifaceFields(server, sOut))
    })
  }
})
