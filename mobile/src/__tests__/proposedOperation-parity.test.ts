import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

/**
 * Drift guard for the hand-duplicated `ProposedOperation` union.
 *
 * The server type (functions/src/agentTools.ts) is the source of
 * truth — the function validates + returns these ops. The client copy
 * (core/src/ports/aiContracts.ts, used by core's op planner and the mobile
 * chat) hand-mirrors it because the functions package CANNOT import core/
 * (separate tsconfig, deployed standalone), so there's no shared module.
 * They drift silently unless something checks.
 *
 * This reads BOTH files as text (an fs read, not an import — no arch-
 * boundary violation; test files are exempt anyway) and compares the
 * STRUCTURE, nested all the way down: each `kind`, the field-name +
 * optionality set inside its `args`, and the fields of every nested object —
 * inline (`pickTodos.edit`, `steps[]`) or a named interface in the same file
 * (`reminders[]` → AgentReminder, `recurrence` → AgentRecurrence). It
 * deliberately ignores leaf TYPES (so `Priority` vs `AgentPriority` and
 * formatting/comments don't false-positive) — the real drift risk is an
 * added/removed/renamed/re-optionalized field.
 */

const SERVER = resolve(__dirname, '../../../functions/src/agentTools.ts')
const CLIENT = resolve(__dirname, '../../../core/src/ports/aiContracts.ts')

/**
 * Contract fields the client and server are adding in parallel (2026-10-19:
 * same-turn `newCategoryLabel`, pick-list `totalMatches`). Until BOTH sides
 * carry one, a field listed here that exists on only one side is ignored;
 * once both have it, it's compared like any other. Delete entries once the
 * server copy lands.
 */
// Empty: the server copy landed (2026-10-19) — client and server now match.
// Re-use this for the next contract change made on both sides in parallel.
const PENDING: Record<string, string[]> = {}

interface Field {
  key: string // name + '?' when optional
  type: string
}

const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

/** Index of the `}` matching the `{` at `open`. */
function matchBrace(s: string, open: number): number {
  let depth = 0
  for (let j = open; j < s.length; j++) {
    if (s[j] === '{') depth++
    else if (s[j] === '}' && --depth === 0) return j
  }
  throw new Error('unbalanced braces')
}

/** Top-level `name: type` / `name?: type` members of an object-type body. */
function topLevelFields(bodyRaw: string): Field[] {
  const body = stripComments(bodyRaw)
  const fields: Field[] = []
  let depth = 0
  let token = ''
  const flush = () => {
    const t = token.trim()
    token = ''
    const fm = t.match(/^(\w+)\s*(\??)\s*:\s*([\s\S]*)$/)
    if (fm) fields.push({ key: fm[1] + (fm[2] ? '?' : ''), type: fm[3].trim() })
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
  return fields
}

/** Body of `interface <name> { … }` in `src`, or null. */
function interfaceBody(src: string, name: string): string | null {
  const m = new RegExp(`interface\\s+${name}\\s*\\{`).exec(src)
  if (!m) return null
  const open = m.index + m[0].length - 1
  return src.slice(open + 1, matchBrace(src, open))
}

/**
 * Flatten an object type into `path → sorted field keys`, recursing into
 * inline objects (`{…}`, `Array<{…}>`) and same-file interfaces
 * (`Name`, `Name[]`, `Array<Name>`).
 */
function shape(src: string, path: string, body: string, out: Record<string, string[]>): void {
  const fields = topLevelFields(body)
  out[path] = fields.map((f) => f.key).sort()
  for (const f of fields) {
    const name = f.key.replace('?', '')
    const inline = f.type.indexOf('{')
    if (inline >= 0) {
      const isArray = /^Array\s*</.test(f.type)
      shape(src, `${path}.${name}${isArray ? '[]' : ''}`, f.type.slice(inline + 1, matchBrace(f.type, inline)), out)
      continue
    }
    const named = f.type.match(/^(?:Array\s*<\s*)?(\w+)\s*>?\s*(\[\])?$/)
    if (!named) continue
    const iface = interfaceBody(src, named[1])
    if (iface !== null) {
      const isArray = !!named[2] || /^Array\s*</.test(f.type)
      shape(src, `${path}.${name}${isArray ? '[]' : ''}`, iface, out)
    }
  }
}

/** The `ProposedOperation` union's text — bounded at the END of the union
 * (the first line after it that isn't part of a `|` member), not a fixed
 * slice length. */
function unionRegion(src: string): string {
  const start = src.indexOf('export type ProposedOperation')
  if (start < 0) throw new Error('ProposedOperation type not found')
  const lines = src.slice(start).split('\n')
  let end = 1
  while (end < lines.length && /^(\s|\|)/.test(lines[end])) end++
  return lines.slice(0, end).join('\n')
}

/** Map `<kind>.args[.nested…]` → sorted field keys for every op kind. */
function extractOps(src: string): Record<string, string[]> {
  const region = unionRegion(src)
  const out: Record<string, string[]> = {}
  const kindRe = /kind:\s*'(\w+)'/g
  const kinds: { name: string; idx: number }[] = []
  let m: RegExpExecArray | null
  while ((m = kindRe.exec(region))) kinds.push({ name: m[1], idx: m.index })
  for (let i = 0; i < kinds.length; i++) {
    const seg = region.slice(kinds[i].idx, kinds[i + 1]?.idx ?? region.length)
    const argsAt = seg.indexOf('args:')
    if (argsAt < 0) {
      out[`${kinds[i].name}.args`] = []
      continue
    }
    const open = seg.indexOf('{', argsAt)
    shape(src, `${kinds[i].name}.args`, seg.slice(open + 1, matchBrace(seg, open)), out)
  }
  return out
}

/** Drop PENDING fields that exist on only one side (see PENDING). */
function reconcilePending(
  a: Record<string, string[]>,
  b: Record<string, string[]>,
): [Record<string, string[]>, Record<string, string[]>] {
  const ca = { ...a }
  const cb = { ...b }
  for (const [path, keys] of Object.entries(PENDING)) {
    for (const k of keys) {
      const inA = !!ca[path]?.includes(k)
      const inB = !!cb[path]?.includes(k)
      if (inA === inB) continue
      if (ca[path]) ca[path] = ca[path].filter((x) => x !== k)
      if (cb[path]) cb[path] = cb[path].filter((x) => x !== k)
    }
  }
  return [ca, cb]
}

const kindsOf = (ops: Record<string, string[]>) =>
  [...new Set(Object.keys(ops).map((p) => p.split('.')[0]))].sort()

describe('ProposedOperation server↔client parity', () => {
  const server = extractOps(readFileSync(SERVER, 'utf8'))
  const client = extractOps(readFileSync(CLIENT, 'utf8'))

  it('parses every op kind identically from both files', () => {
    expect(kindsOf(server)).toEqual([
      'addGroceryItem',
      'addSteps',
      'createCategory',
      'createStore',
      'createTodo',
      'deferOverdue',
      'deleteCategory',
      'deleteGroceryItem',
      'deleteStore',
      'deleteTodo',
      'editCategory',
      'editGroceryItem',
      'editTodo',
      'markDone',
      'markUndone',
      'pickTodos',
      'renameStore',
      'restoreTodo',
      'setGroceryChecked',
      'skipTodo',
      'subtaskAction',
    ])
    expect(kindsOf(client)).toEqual(kindsOf(server))
  })

  it('walks into nested objects (reminders, recurrence, pickTodos.edit, steps)', () => {
    expect(client['createTodo.args.reminders[]']).toEqual(['at', 'intervalMinutes?', 'offsetMinutes?'])
    expect(client['editTodo.args.recurrence']).toEqual(['byWeekday?', 'freq', 'interval?'])
    expect(client['pickTodos.args.edit.reminders[]']).toEqual(['at', 'intervalMinutes?', 'offsetMinutes?'])
    expect(client['addSteps.args.steps[]']).toEqual(['text'])
    for (const p of ['createTodo.args.reminders[]', 'editTodo.args.recurrence', 'pickTodos.args.edit']) {
      expect(server[p], p).toBeDefined()
    }
  })

  it('every kind has identical (nested) arg field-shape on client and server', () => {
    const [c, s] = reconcilePending(client, server)
    expect(c).toEqual(s)
  })

  it('the union is bounded at its end, not a fixed slice', () => {
    const src = 'export type ProposedOperation =\n  | { kind: \'a\'; args: { x: string } }\n\nconst later = { kind: \'zzz\' }\n'
    expect(Object.keys(extractOps(src))).toEqual(['a.args'])
  })
})
