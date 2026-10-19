/**
 * Server side of the Mochi client↔server contracts added in the 2026-10
 * fix batch (the mobile client implements the other side):
 *  (b) newCategoryLabel on createTodo/editTodo for a category created in
 *      the SAME turn;
 *  (c) pickTodos.totalMatches when the candidate list is truncated;
 *  (d) editTodo ignores a bare dueDate "" unless clearDueDate: true;
 * plus calendar-checked dates and the editTodo reminders wording.
 */
import { describe, expect, it } from 'vitest'
import { AGENT_TOOLS, pendingCategoryLabels, validateOperation } from './agentTools'

const knownCats = new Set(['home', 'work'])
const knownTodoIds = new Set(['t-1', 't-2'])

describe('validateOperation — newCategoryLabel', () => {
  const categories = [
    { id: 'home', label: 'Home' },
    { id: 'work', label: 'Work' },
  ]
  const pending = pendingCategoryLabels([
    { name: 'createCategory', input: { label: '  Garden ' } },
    { name: 'createTodo', input: { text: 'x' } },
  ])
  const v = (name: string, args: unknown, extra: Record<string, unknown> = {}) =>
    validateOperation(name, args, knownCats, knownTodoIds, undefined, undefined, [], undefined, {
      categories,
      pendingCategoryLabels: pending,
      ...extra,
    })

  it('pendingCategoryLabels lower-cases the trimmed createCategory labels only', () => {
    expect([...pending]).toEqual(['garden'])
    expect(pendingCategoryLabels([{ name: 'createCategory', input: { label: '  ' } }]).size).toBe(0)
    expect(pendingCategoryLabels([{ name: 'createCategory', input: null }]).size).toBe(0)
  })
  it('createTodo: an unknown category matching a same-turn createCategory → newCategoryLabel', () => {
    expect(v('createTodo', { text: 'Plant tulips', category: 'garden' })?.args).toEqual({
      text: 'Plant tulips',
      newCategoryLabel: 'garden',
    })
  })
  it('createTodo: explicit newCategoryLabel is kept (trimmed, capped at the label cap)', () => {
    expect(v('createTodo', { text: 'Plant tulips', newCategoryLabel: ' Garden ' })?.args).toEqual({
      text: 'Plant tulips',
      newCategoryLabel: 'Garden',
    })
    const long = 'G'.repeat(60)
    const p = pendingCategoryLabels([{ name: 'createCategory', input: { label: long } }])
    const op = v('createTodo', { text: 't', newCategoryLabel: long }, { pendingCategoryLabels: p })
    expect(op?.kind === 'createTodo' && op.args.newCategoryLabel?.length).toBe(40)
  })
  it('a label with NO matching createCategory this turn is dropped', () => {
    expect(v('createTodo', { text: 't', newCategoryLabel: 'Fitness' })?.args).toEqual({ text: 't' })
    expect(v('createTodo', { text: 't', category: 'cat_fitness' })?.args).toEqual({ text: 't' })
    // No options at all → old behavior (unknown id dropped).
    expect(validateOperation('createTodo', { text: 't', category: 'Garden' }, knownCats)?.args).toEqual({
      text: 't',
    })
  })
  it('a known id wins; an existing label resolves to its id', () => {
    expect(v('createTodo', { text: 't', category: 'home', newCategoryLabel: 'Garden' })?.args).toEqual({
      text: 't',
      category: 'home',
    })
    expect(v('createTodo', { text: 't', category: 'WORK' })?.args).toEqual({ text: 't', category: 'work' })
    expect(v('createTodo', { text: 't', newCategoryLabel: 'home' })?.args).toEqual({
      text: 't',
      category: 'home',
    })
  })
  it('editTodo: newCategoryLabel alone counts as a change', () => {
    expect(v('editTodo', { todoId: 't-1', category: 'Garden' })).toEqual({
      kind: 'editTodo',
      args: { todoId: 't-1', newCategoryLabel: 'Garden' },
    })
    expect(v('editTodo', { todoId: 't-1', newCategoryLabel: 'Nope' })).toBeNull()
  })
  it('pickTodos edit never carries newCategoryLabel (it ships alone)', () => {
    const op = validateOperation(
      'pickTodos',
      { action: 'edit', query: 'report', edit: { category: 'Garden' } },
      knownCats,
      new Set(['a', 'b']),
      undefined,
      undefined,
      [
        { id: 'a', text: 'report one' },
        { id: 'b', text: 'report two' },
      ],
      undefined,
      { categories, pendingCategoryLabels: pending },
    )
    expect(op).toBeNull()
  })
})

describe('validateOperation — pickTodos totalMatches', () => {
  const many = Array.from({ length: 30 }, (_, i) => ({ id: `p-${i}`, text: `water plant ${i}` }))
  const ids = new Set(many.map((t) => t.id))
  const pick = (todos: typeof many) =>
    validateOperation(
      'pickTodos',
      { action: 'delete', query: 'water plant' },
      knownCats,
      ids,
      undefined,
      undefined,
      todos,
    )

  it('is set to the pre-cap match count when the list was truncated', () => {
    const op = pick(many)
    expect(op?.kind).toBe('pickTodos')
    if (op?.kind !== 'pickTodos') return
    expect(op.args.todoIds).toHaveLength(25)
    expect(op.args.totalMatches).toBe(30)
  })
  it('is absent when nothing was cut', () => {
    const op = pick(many.slice(0, 3))
    expect(op?.kind === 'pickTodos' && 'totalMatches' in op.args).toBe(false)
  })
})

describe('validateOperation — calendar-checked dates', () => {
  it('createTodo drops an impossible dueDate but keeps the to-do', () => {
    expect(validateOperation('createTodo', { text: 't', dueDate: '2026-02-31' }, knownCats)?.args).toEqual({
      text: 't',
    })
    expect(
      validateOperation('createTodo', { text: 't', dueDate: '2026-02-28T09:30' }, knownCats)?.args,
    ).toEqual({ text: 't', dueDate: '2026-02-28T09:30' })
  })
  it('deferOverdue rejects an impossible date', () => {
    expect(validateOperation('deferOverdue', { dueDate: '2026-02-30' }, knownCats)).toBeNull()
    expect(validateOperation('deferOverdue', { dueDate: '2026-03-02' }, knownCats)).toEqual({
      kind: 'deferOverdue',
      args: { dueDate: '2026-03-02' },
    })
  })
  it('reminders with an impossible `at` are dropped', () => {
    const op = validateOperation(
      'createTodo',
      { text: 't', reminders: [{ at: '2026-06-07T25:99' }, { at: '2026-06-07T09:00' }] },
      knownCats,
    )
    expect(op?.kind === 'createTodo' && op.args.reminders).toEqual([{ at: '2026-06-07T09:00' }])
  })
})

describe('AGENT_TOOLS — schema contracts', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const props = (name: string) => AGENT_TOOLS.find((t) => t.name === name)!.input_schema.properties as Record<string, any>
  it('createTodo + editTodo expose newCategoryLabel', () => {
    expect(props('createTodo').newCategoryLabel.type).toBe('string')
    expect(props('editTodo').newCategoryLabel.type).toBe('string')
  })
  it('editTodo + pickTodos.edit expose clearDueDate', () => {
    expect(props('editTodo').clearDueDate.type).toBe('boolean')
    expect(props('pickTodos').edit.properties.clearDueDate.type).toBe('boolean')
  })
  it('editTodo reminders say they replace the whole list', () => {
    expect(props('editTodo').reminders.description).toMatch(/full desired list/)
    expect(AGENT_TOOLS.find((t) => t.name === 'editTodo')!.description).toMatch(/full desired list/)
  })
})
