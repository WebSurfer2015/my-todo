import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { PRIORITY_VALUES } from '../../../core/src/domain/types'
import { literalMembers, matchBrace, shape, typeAliasRhs } from './contractShape'

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
 * STRUCTURE, nested all the way down (contractShape.ts): each `kind`, the
 * field-name + optionality set inside its `args`, the fields of every nested
 * object — inline (`pickTodos.edit`, `steps[]`) or a named interface in the
 * same file (`reminders[]` → AgentReminder, `recurrence` → AgentRecurrence) —
 * AND the members of every string-literal union leaf (`priority`,
 * `recurrence.freq`, `pickTodos.action`, `scope`, …), resolving same-file
 * aliases (`Priority` vs `AgentPriority`). Other leaf types are ignored so
 * naming/formatting/comments don't false-positive.
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

/** Map `<kind>.args[.nested…]` → sorted field keys (and `…:literals` →
 * sorted literal members) for every op kind. */
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
  const serverSrc = readFileSync(SERVER, 'utf8')
  const server = extractOps(serverSrc)
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

  it('reads string-literal union members at the leaves (inline + aliased)', () => {
    for (const side of [client, server]) {
      expect(side['createTodo.args.priority:literals']).toEqual(['high', 'low', 'medium'])
      expect(side['pickTodos.args.edit.priority:literals']).toEqual(['high', 'low', 'medium'])
      expect(side['editTodo.args.recurrence.freq:literals']).toEqual(['daily', 'monthly', 'weekly', 'yearly'])
      expect(side['pickTodos.args.action:literals']).toEqual(['addSteps', 'delete', 'edit', 'markDone'])
      expect(side['skipTodo.args.scope:literals']).toEqual(['one', 'series'])
      expect(side['subtaskAction.args.action:literals']).toEqual(['complete', 'remove', 'rename', 'uncomplete'])
    }
  })

  it('every kind has identical (nested) arg field-shape AND leaf literal members on client and server', () => {
    const [c, s] = reconcilePending(client, server)
    expect(c).toEqual(s)
  })

  it("pins the server's Priority union to core's PRIORITY_VALUES", () => {
    const rhs = typeAliasRhs(serverSrc, 'Priority')
    expect(rhs, 'server `type Priority = …` not found').not.toBeNull()
    expect(literalMembers(serverSrc, rhs as string)).toEqual([...PRIORITY_VALUES].sort())
  })

  it('the union is bounded at its end, not a fixed slice', () => {
    const src = 'export type ProposedOperation =\n  | { kind: \'a\'; args: { x: string } }\n\nconst later = { kind: \'zzz\' }\n'
    expect(Object.keys(extractOps(src))).toEqual(['a.args'])
  })

  it('a changed literal member is detected (self-test)', () => {
    const a = "type P = 'high' | 'low'\nexport type ProposedOperation =\n  | { kind: 'a'; args: { p?: P; s: 'one' | 'series' } }\n"
    const b = "type Q = 'high' | 'urgent'\nexport type ProposedOperation =\n  | { kind: 'a'; args: { p?: Q; s: 'one' | 'all' } }\n"
    expect(extractOps(a)['a.args.p:literals']).toEqual(['high', 'low'])
    expect(extractOps(a)).not.toEqual(extractOps(b))
    expect(extractOps(a)['a.args']).toEqual(extractOps(b)['a.args']) // same keys — only literals differ
  })
})
