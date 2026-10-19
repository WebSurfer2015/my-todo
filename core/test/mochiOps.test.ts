// Table tests for the Ask Mochi op planner (core/src/logic/mochiOps.ts): every
// op kind → the store-call intents the shell runs, plus the guards (unknown
// id, idempotent markDone, delete-is-never-permanent, step matching) and the
// same-turn `newCategoryLabel` resolution.
import { describe, expect, it } from 'vitest'
import {
  matchSubtask,
  planMochiOp,
  planMochiOps,
  planPickedTodos,
  stampReminders,
  type MochiIntent,
  type MochiSnapshot,
} from '../src/logic/mochiOps'
import type { OpOf, ProposedOperation } from '../src/ports/aiContracts'
import { COLOR_PALETTE } from '../src/data/categories'

const SNAP: MochiSnapshot = {
  today: '2026-10-19',
  todos: [
    { id: 'open', text: 'Call mom', done: false, dueDate: '2026-10-17' },
    { id: 'done', text: 'Pay rent', done: true },
    { id: 'series', text: 'Run', done: false, seriesId: 's1', dueDate: '2026-10-18T07:00' },
    { id: 'trashed', text: 'Old thing', done: false, trashed: true, dueDate: '2026-10-01' },
    { id: 'future', text: 'Dentist', done: false, dueDate: '2026-10-25' },
    // Due TODAY (with a time) — not carried over, so never deferred.
    { id: 'today', text: 'Stretch', done: false, dueDate: '2026-10-19T08:00' },
    // Done but with a past due date (not trashed) — done wins, never deferred.
    { id: 'donePast', text: 'File taxes', done: true, dueDate: '2026-10-10' },
    {
      id: 'steps',
      text: 'Plan trip',
      done: false,
      subtasks: [
        { id: 'st1', text: 'Book flight', done: false },
        { id: 'st2', text: 'Book hotel', done: true },
        { id: 'st3', text: 'Pack', done: false },
        { id: 'st4', text: 'Packing list', done: false },
      ],
    },
  ],
  categories: [
    { id: 'work', label: '', displayLabel: 'Work', color: '#111', icon: 'briefcase' },
    { id: 'gym', label: 'Gym', color: '#222', icon: 'dumbbell' },
  ],
  groceries: [
    { id: 'milk', text: 'Milk', checked: false },
    { id: 'eggs', text: 'Eggs', checked: true },
  ],
}

let n = 0
const deps = { genId: () => `id${++n}` }
const plan = (op: ProposedOperation, snap: MochiSnapshot = SNAP): MochiIntent[] => {
  n = 0
  return planMochiOp(op, snap, deps)
}

describe('planMochiOp — every op kind', () => {
  const cases: Array<[string, ProposedOperation, MochiIntent[]]> = [
    [
      'createTodo (defaults)',
      { kind: 'createTodo', args: { text: 'Buy milk' } },
      [{ type: 'addTask', text: 'Buy milk', priority: 'medium', dueDate: '' }],
    ],
    [
      'createTodo (all fields, reminders stamped)',
      {
        kind: 'createTodo',
        args: {
          text: 'Run',
          dueDate: '2026-10-20',
          priority: 'high',
          category: 'gym',
          notes: 'easy pace',
          recurrence: { freq: 'weekly', byWeekday: [1, 3] },
          reminders: [{ at: '2026-10-20T07:00', offsetMinutes: 0, intervalMinutes: 30 }],
        },
      },
      [
        {
          type: 'addTask',
          text: 'Run',
          priority: 'high',
          dueDate: '2026-10-20',
          category: { id: 'gym' },
          recurrence: { freq: 'weekly', byWeekday: [1, 3] },
          notes: 'easy pace',
          reminders: [{ id: 'id1', at: '2026-10-20T07:00', intervalMinutes: 30 }],
        },
      ],
    ],
    [
      'editTodo (patch only what is set; "" clears the date)',
      { kind: 'editTodo', args: { todoId: 'open', text: 'Call Mom', dueDate: '', priority: 'low', notes: 'Ask about Sunday' } },
      [
        { type: 'updateText', todoId: 'open', text: 'Call Mom' },
        { type: 'updatePriority', todoId: 'open', priority: 'low' },
        { type: 'updateDueDate', todoId: 'open', dueDate: '' },
        { type: 'updateNotes', todoId: 'open', notes: 'Ask about Sunday' },
      ],
    ],
    [
      'editTodo (category, recurrence, reminders)',
      {
        kind: 'editTodo',
        args: {
          todoId: 'open',
          category: 'work',
          recurrence: { freq: 'daily' },
          reminders: [{ at: '2026-10-20T09:00' }],
        },
      },
      [
        { type: 'updateCategory', todoId: 'open', category: { id: 'work' } },
        { type: 'updateRecurrence', todoId: 'open', recurrence: { freq: 'daily' } },
        { type: 'updateReminders', todoId: 'open', reminders: [{ id: 'id1', at: '2026-10-20T09:00' }] },
      ],
    ],
    ['editTodo unknown id → no-op', { kind: 'editTodo', args: { todoId: 'nope', text: 'x' } }, []],
    ['editTodo on a trashed to-do → no-op', { kind: 'editTodo', args: { todoId: 'trashed', text: 'x' } }, []],
    [
      'addSteps (blank steps dropped)',
      { kind: 'addSteps', args: { todoId: 'open', steps: [{ text: 'Dial' }, { text: '  ' }, { text: 'Talk' }] } },
      [
        { type: 'addSubtask', todoId: 'open', text: 'Dial' },
        { type: 'addSubtask', todoId: 'open', text: 'Talk' },
      ],
    ],
    ['addSteps unknown id → no-op', { kind: 'addSteps', args: { todoId: 'nope', steps: [{ text: 'a' }] } }, []],
    ['markDone open → toggle', { kind: 'markDone', args: { todoId: 'open' } }, [{ type: 'toggle', todoId: 'open' }]],
    ['markDone on a done item → no-op (never re-opens)', { kind: 'markDone', args: { todoId: 'done' } }, []],
    ['markDone unknown id → no-op', { kind: 'markDone', args: { todoId: 'nope' } }, []],
    ['markUndone done → toggle', { kind: 'markUndone', args: { todoId: 'done' } }, [{ type: 'toggle', todoId: 'done' }]],
    ['markUndone on an open item → no-op', { kind: 'markUndone', args: { todoId: 'open' } }, []],
    [
      'createCategory (explicit color/icon)',
      { kind: 'createCategory', args: { label: 'Kids', color: '#abc', icon: 'baby' } },
      [{ type: 'addCategory', label: 'Kids', color: '#abc', icon: 'baby' }],
    ],
    [
      'createCategory (palette rotation + tag icon)',
      { kind: 'createCategory', args: { label: 'Kids' } },
      [{ type: 'addCategory', label: 'Kids', color: COLOR_PALETTE[2 % COLOR_PALETTE.length], icon: 'tag' }],
    ],
    ['createStore', { kind: 'createStore', args: { name: 'Costco' } }, [{ type: 'addGroceryStore', name: 'Costco' }]],
    [
      'addGroceryItem',
      { kind: 'addGroceryItem', args: { text: 'Bread', groupId: 'bakery', stores: ['Costco'] } },
      [{ type: 'addGrocery', text: 'Bread', groupId: 'bakery', stores: ['Costco'] }],
    ],
    [
      'deleteTodo → move to Done (never permanent)',
      { kind: 'deleteTodo', args: { todoId: 'open' } },
      [{ type: 'moveToTrash', todoId: 'open' }],
    ],
    [
      'deleteTodo on a series instance → ask the scope',
      { kind: 'deleteTodo', args: { todoId: 'series' } },
      [{ type: 'askDeleteScope', todoId: 'series', text: 'Run' }],
    ],
    ['deleteTodo unknown id → no-op', { kind: 'deleteTodo', args: { todoId: 'nope' } }, []],
    ['deleteTodo already trashed → no-op', { kind: 'deleteTodo', args: { todoId: 'trashed' } }, []],
    [
      'deleteGroceryItem → removes (the card confirmed; Undo restores)',
      { kind: 'deleteGroceryItem', args: { groceryId: 'milk' } },
      [{ type: 'removeGrocery', groceryId: 'milk' }],
    ],
    ['deleteGroceryItem unknown id → no-op', { kind: 'deleteGroceryItem', args: { groceryId: 'nope' } }, []],
    [
      'pickTodos → nothing until the user ticks (planPickedTodos)',
      { kind: 'pickTodos', args: { action: 'delete', todoIds: ['open'] } },
      [],
    ],
    [
      'editGroceryItem',
      { kind: 'editGroceryItem', args: { groceryId: 'milk', text: 'Oat milk', stores: [] } },
      [{ type: 'editGrocery', groceryId: 'milk', patch: { text: 'Oat milk', stores: [] } }],
    ],
    ['editGroceryItem unknown id → no-op', { kind: 'editGroceryItem', args: { groceryId: 'nope', text: 'x' } }, []],
    [
      'editCategory merges over current values (keeps a built-in\'s empty label)',
      { kind: 'editCategory', args: { categoryId: 'work', color: '#f00' } },
      [{ type: 'editCategory', categoryId: 'work', label: '', color: '#f00', icon: 'briefcase' }],
    ],
    ['editCategory unknown id → no-op', { kind: 'editCategory', args: { categoryId: 'nope', label: 'x' } }, []],
    ['deleteCategory', { kind: 'deleteCategory', args: { categoryId: 'gym' } }, [{ type: 'deleteCategory', categoryId: 'gym' }]],
    ['deleteCategory unknown id → no-op', { kind: 'deleteCategory', args: { categoryId: 'nope' } }, []],
    [
      'setGroceryChecked flips when different',
      { kind: 'setGroceryChecked', args: { groceryId: 'milk', checked: true } },
      [{ type: 'toggleGroceryChecked', groceryId: 'milk' }],
    ],
    ['setGroceryChecked already in that state → no-op', { kind: 'setGroceryChecked', args: { groceryId: 'eggs', checked: true } }, []],
    ['setGroceryChecked unknown id → no-op', { kind: 'setGroceryChecked', args: { groceryId: 'nope', checked: true } }, []],
    ['renameStore', { kind: 'renameStore', args: { from: 'A', to: 'B' } }, [{ type: 'renameGroceryStore', from: 'A', to: 'B' }]],
    ['deleteStore', { kind: 'deleteStore', args: { name: 'A' } }, [{ type: 'deleteGroceryStore', name: 'A' }]],
    ['skipTodo', { kind: 'skipTodo', args: { todoId: 'open' } }, [{ type: 'skipTodo', todoId: 'open' }]],
    [
      'skipTodo scope series on a series → skip this & future',
      { kind: 'skipTodo', args: { todoId: 'series', scope: 'series' } },
      [{ type: 'skipSeriesFuture', todoId: 'series' }],
    ],
    [
      'skipTodo scope series on a one-off → plain skip',
      { kind: 'skipTodo', args: { todoId: 'open', scope: 'series' } },
      [{ type: 'skipTodo', todoId: 'open' }],
    ],
    ['skipTodo unknown id → no-op', { kind: 'skipTodo', args: { todoId: 'nope' } }, []],
    [
      'deferOverdue moves only open, untrashed, past-due to-dos (not due-today, not done)',
      { kind: 'deferOverdue', args: { dueDate: '2026-10-21' } },
      [{ type: 'bulkDeferTodos', todoIds: ['open', 'series'], dueDate: '2026-10-21' }],
    ],
    ['restoreTodo (trashed)', { kind: 'restoreTodo', args: { todoId: 'trashed' } }, [{ type: 'restoreFromTrash', todoId: 'trashed' }]],
    ['restoreTodo on a live to-do → no-op', { kind: 'restoreTodo', args: { todoId: 'open' } }, []],
    ['restoreTodo unknown id → no-op', { kind: 'restoreTodo', args: { todoId: 'nope' } }, []],
    [
      'subtaskAction complete (exact match)',
      { kind: 'subtaskAction', args: { todoId: 'steps', subtaskText: 'book flight', action: 'complete' } },
      [{ type: 'toggleSubtask', todoId: 'steps', subtaskId: 'st1' }],
    ],
    [
      'subtaskAction complete on a done step → no-op',
      { kind: 'subtaskAction', args: { todoId: 'steps', subtaskText: 'Book hotel', action: 'complete' } },
      [],
    ],
    [
      'subtaskAction uncomplete',
      { kind: 'subtaskAction', args: { todoId: 'steps', subtaskText: 'Book hotel', action: 'uncomplete' } },
      [{ type: 'toggleSubtask', todoId: 'steps', subtaskId: 'st2' }],
    ],
    [
      'subtaskAction remove — exact "Pack" beats the "Packing list" prefix',
      { kind: 'subtaskAction', args: { todoId: 'steps', subtaskText: 'Pack', action: 'remove' } },
      [{ type: 'removeSubtask', todoId: 'steps', subtaskId: 'st3' }],
    ],
    [
      'subtaskAction rename (unique prefix)',
      { kind: 'subtaskAction', args: { todoId: 'steps', subtaskText: 'Packing', action: 'rename', newText: 'Pack list' } },
      [{ type: 'updateSubtaskText', todoId: 'steps', subtaskId: 'st4', text: 'Pack list' }],
    ],
    [
      'subtaskAction rename without newText → no-op',
      { kind: 'subtaskAction', args: { todoId: 'steps', subtaskText: 'Pack', action: 'rename' } },
      [],
    ],
    [
      'subtaskAction ambiguous prefix ("Book" → flight + hotel) → no-op',
      { kind: 'subtaskAction', args: { todoId: 'steps', subtaskText: 'Book', action: 'remove' } },
      [],
    ],
    [
      'subtaskAction no match (substring is NOT enough) → no-op',
      { kind: 'subtaskAction', args: { todoId: 'steps', subtaskText: 'flight', action: 'remove' } },
      [],
    ],
    [
      'subtaskAction unknown to-do → no-op',
      { kind: 'subtaskAction', args: { todoId: 'nope', subtaskText: 'Pack', action: 'remove' } },
      [],
    ],
  ]

  it.each(cases)('%s', (_name, op, expected) => {
    expect(plan(op)).toEqual(expected)
  })

  it('covers every op kind in the union', () => {
    const kinds = new Set(cases.map(([, op]) => op.kind))
    expect([...kinds].sort()).toEqual(
      [
        'addGroceryItem', 'addSteps', 'createCategory', 'createStore', 'createTodo', 'deferOverdue',
        'deleteCategory', 'deleteGroceryItem', 'deleteStore', 'deleteTodo', 'editCategory',
        'editGroceryItem', 'editTodo', 'markDone', 'markUndone', 'pickTodos', 'renameStore',
        'restoreTodo', 'setGroceryChecked', 'skipTodo', 'subtaskAction',
      ].sort(),
    )
  })

  it('never plans a permanent delete for any op', () => {
    const all = cases.flatMap(([, op]) => plan(op)).map((i) => i.type as string)
    expect(all.some((t) => /permanent/i.test(t))).toBe(false)
  })
})

describe('newCategoryLabel — a category created in the same turn', () => {
  it('reuses an existing category with that label (case-insensitive, display label)', () => {
    expect(plan({ kind: 'createTodo', args: { text: 'x', newCategoryLabel: ' work ' } })).toEqual([
      { type: 'addTask', text: 'x', priority: 'medium', dueDate: '', category: { id: 'work' } },
    ])
    expect(plan({ kind: 'editTodo', args: { todoId: 'open', newCategoryLabel: 'GYM' } })).toEqual([
      { type: 'updateCategory', todoId: 'open', category: { id: 'gym' } },
    ])
  })

  it('uses the batch\'s createCategory (hoisted ahead, case-insensitive) — no duplicate', () => {
    n = 0
    const intents = planMochiOps(
      [
        { kind: 'createTodo', args: { text: 'Soccer', newCategoryLabel: 'kids' } },
        { kind: 'createCategory', args: { label: 'Kids', color: '#abc' } },
      ],
      SNAP,
      deps,
    )
    expect(intents).toEqual([
      { type: 'addCategory', label: 'Kids', color: '#abc', icon: 'tag' },
      { type: 'addTask', text: 'Soccer', priority: 'medium', dueDate: '', category: { newLabel: 'kids' } },
    ])
  })

  it('creates the category when no createCategory op in the batch did — once for several to-dos', () => {
    n = 0
    const intents = planMochiOps(
      [
        { kind: 'createTodo', args: { text: 'A', newCategoryLabel: 'Kids' } },
        { kind: 'editTodo', args: { todoId: 'open', newCategoryLabel: 'kids' } },
      ],
      SNAP,
      deps,
    )
    expect(intents).toEqual([
      { type: 'addCategory', label: 'Kids', color: COLOR_PALETTE[2 % COLOR_PALETTE.length], icon: 'tag' },
      { type: 'addTask', text: 'A', priority: 'medium', dueDate: '', category: { newLabel: 'Kids' } },
      { type: 'updateCategory', todoId: 'open', category: { newLabel: 'kids' } },
    ])
  })

  it('newCategoryLabel wins over a category id', () => {
    expect(plan({ kind: 'createTodo', args: { text: 'x', category: 'gym', newCategoryLabel: 'Work' } })[0]).toMatchObject({
      category: { id: 'work' },
    })
  })
})

describe('planPickedTodos', () => {
  const pick = (args: OpOf<'pickTodos'>['args']): OpOf<'pickTodos'> => ({ kind: 'pickTodos', args })

  it('delete → Done bin per live ticked id (unknown / trashed / dupes dropped)', () => {
    expect(planPickedTodos(pick({ action: 'delete', todoIds: [] }), ['open', 'nope', 'trashed', 'open', 'future'], SNAP, deps)).toEqual([
      { type: 'moveToTrash', todoId: 'open' },
      { type: 'moveToTrash', todoId: 'future' },
    ])
  })

  it('markDone only flips open ones', () => {
    expect(planPickedTodos(pick({ action: 'markDone', todoIds: [] }), ['open', 'done'], SNAP, deps)).toEqual([
      { type: 'toggle', todoId: 'open' },
    ])
  })

  it('edit applies the patch to each; a new category is created once', () => {
    n = 0
    const edit = { priority: 'high' as const, newCategoryLabel: 'Errands', reminders: [{ at: '2026-10-20T09:00' }] }
    expect(planPickedTodos(pick({ action: 'edit', todoIds: [], edit }), ['open', 'future'], SNAP, deps)).toEqual([
      { type: 'updatePriority', todoId: 'open', priority: 'high' },
      { type: 'addCategory', label: 'Errands', color: COLOR_PALETTE[2 % COLOR_PALETTE.length], icon: 'tag' },
      { type: 'updateCategory', todoId: 'open', category: { newLabel: 'Errands' } },
      { type: 'updateReminders', todoId: 'open', reminders: [{ id: 'id1', at: '2026-10-20T09:00' }] },
      { type: 'updatePriority', todoId: 'future', priority: 'high' },
      { type: 'updateCategory', todoId: 'future', category: { newLabel: 'Errands' } },
      { type: 'updateReminders', todoId: 'future', reminders: [{ id: 'id2', at: '2026-10-20T09:00' }] },
    ])
  })

  it('edit without a patch → nothing', () => {
    expect(planPickedTodos(pick({ action: 'edit', todoIds: [] }), ['open'], SNAP, deps)).toEqual([])
  })

  it('addSteps adds each step to each', () => {
    expect(
      planPickedTodos(pick({ action: 'addSteps', todoIds: [], steps: [{ text: 'a' }, { text: ' ' }] }), ['open', 'future'], SNAP, deps),
    ).toEqual([
      { type: 'addSubtask', todoId: 'open', text: 'a' },
      { type: 'addSubtask', todoId: 'future', text: 'a' },
    ])
    expect(planPickedTodos(pick({ action: 'addSteps', todoIds: [] }), ['open'], SNAP, deps)).toEqual([])
  })
})

describe('stampReminders', () => {
  it('undefined for an empty / absent list', () => {
    expect(stampReminders(undefined, deps.genId)).toBeUndefined()
    expect(stampReminders([], deps.genId)).toBeUndefined()
  })
  it('mints a fresh id per entry and drops zero offset/interval', () => {
    n = 0
    expect(stampReminders([{ at: 'a', offsetMinutes: 15 }, { at: 'b', intervalMinutes: 0 }], deps.genId)).toEqual([
      { id: 'id1', at: 'a', offsetMinutes: 15 },
      { id: 'id2', at: 'b' },
    ])
  })
})

describe('matchSubtask', () => {
  const subs = [
    { id: '1', text: 'Call  the bank' },
    { id: '2', text: 'Recall the plumber' },
    { id: '3', text: 'Call' },
  ]
  it('exact (case/space-insensitive) first', () => {
    expect(matchSubtask(subs, ' call ')).toEqual({ kind: 'match', id: '3' })
    expect(matchSubtask(subs, 'call the BANK')).toEqual({ kind: 'match', id: '1' })
  })
  it('then a unique prefix; never a mid-word substring', () => {
    expect(matchSubtask(subs, 'recall')).toEqual({ kind: 'match', id: '2' })
    expect(matchSubtask(subs, 'plumber')).toEqual({ kind: 'none' })
  })
  it('several prefix hits → ambiguous', () => {
    expect(matchSubtask([{ id: 'a', text: 'Book flight' }, { id: 'b', text: 'Book hotel' }], 'book')).toEqual({
      kind: 'ambiguous',
    })
  })
  it('duplicate exact titles → ambiguous', () => {
    expect(matchSubtask([{ id: 'a', text: 'Pack' }, { id: 'b', text: 'pack' }], 'Pack')).toEqual({ kind: 'ambiguous' })
  })
  it('empty query / no steps → none', () => {
    expect(matchSubtask(subs, '  ')).toEqual({ kind: 'none' })
    expect(matchSubtask(undefined, 'x')).toEqual({ kind: 'none' })
  })
})
