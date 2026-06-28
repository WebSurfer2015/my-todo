import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

/**
 * Drift guard for the hand-duplicated `ProposedOperation` union.
 *
 * The server type (web/functions/src/agentTools.ts) is the source of
 * truth — the function validates + returns these ops. The mobile client
 * (src/features/mochi/useMochiAgent.ts) hand-mirrors it because the
 * functions package CANNOT import core/ or mobile/ (separate tsconfig,
 * deployed standalone), so there's no shared module. They drift silently
 * unless something checks.
 *
 * This reads BOTH files as text (an fs read, not an import — no arch-
 * boundary violation; test files are exempt anyway) and compares the
 * STRUCTURE: each `kind` and the field-name+optionality set inside its
 * `args`. It deliberately ignores field TYPES (so `Priority` vs
 * `AgentPriority` and formatting/comments don't false-positive) — the
 * real drift risk is an added/removed/renamed/re-optionalized field.
 */

const SERVER = resolve(__dirname, '../../../web/functions/src/agentTools.ts')
const CLIENT = resolve(__dirname, '../features/mochi/useMochiAgent.ts')

/** Map each op `kind` → sorted list of top-level arg fields (with `?`). */
function extractOps(src: string): Record<string, string[]> {
  const start = src.indexOf('export type ProposedOperation')
  if (start < 0) throw new Error('ProposedOperation type not found')
  // Generous slice — the 7-op union is a few KB in both files.
  const region = src.slice(start, start + 5000)
  const kinds: { name: string; idx: number }[] = []
  const kindRe = /kind:\s*'(\w+)'/g
  let m: RegExpExecArray | null
  while ((m = kindRe.exec(region))) kinds.push({ name: m[1], idx: m.index })

  const out: Record<string, string[]> = {}
  for (let i = 0; i < kinds.length; i++) {
    const seg = region.slice(kinds[i].idx, kinds[i + 1]?.idx ?? region.length)
    const argsAt = seg.indexOf('args:')
    if (argsAt < 0) {
      out[kinds[i].name] = []
      continue
    }
    const braceStart = seg.indexOf('{', argsAt)
    let depth = 0
    let end = braceStart
    for (let j = braceStart; j < seg.length; j++) {
      if (seg[j] === '{') depth++
      else if (seg[j] === '}') {
        depth--
        if (depth === 0) {
          end = j
          break
        }
      }
    }
    out[kinds[i].name] = extractFields(seg.slice(braceStart + 1, end))
  }
  return out
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

describe('ProposedOperation server↔client parity', () => {
  const server = extractOps(readFileSync(SERVER, 'utf8'))
  const client = extractOps(readFileSync(CLIENT, 'utf8'))

  it('parses all eleven op kinds from both files', () => {
    expect(Object.keys(server).sort()).toEqual([
      'addGroceryItem',
      'addSteps',
      'createCategory',
      'createStore',
      'createTodo',
      'deleteGroceryItem',
      'deleteTodo',
      'editGroceryItem',
      'editTodo',
      'markDone',
      'pickTodos',
    ])
    expect(Object.keys(client).sort()).toEqual(Object.keys(server).sort())
  })

  it('every kind has identical arg field-shape on client and server', () => {
    expect(client).toEqual(server)
  })
})
