/**
 * Ask Mochi op planner — the pure use-case layer behind "Confirm".
 *
 * The agent proposes `ProposedOperation`s; the user confirms; the app applies
 * them through the SAME store mutations a manual tap uses (the agent has no
 * privileged write path). This module turns each op into an ordered list of
 * `MochiIntent`s — plain descriptors of store calls — against a read-only
 * snapshot of the user's data. The mobile shell (SheetContext) is a thin
 * executor: it maps each intent onto one store call / Alert and collects the
 * Undos the store hands back.
 *
 * Every guard lives here so it's table-testable: an unknown id is a no-op,
 * markDone on a done to-do is a no-op (toggle would RE-OPEN it), a delete is
 * always a move to the 30-day Done bin (never permanent), a step is matched
 * exactly first and then by a UNIQUE prefix (never "first substring hit").
 *
 * PURE + platform-free: no React / RN; ids for reminders come from `genId`.
 */

import type {
  AgentPriority,
  AgentRecurrence,
  AgentReminder,
  OpOf,
  ProposedOperation,
} from '../ports/aiContracts'
import type { Recurrence, Reminder } from '../domain/types'
import { COLOR_PALETTE } from '../data/categories'
import { dueDateOnly } from './utils'

/** Read-only view of the user's data the planner checks ops against. */
export interface MochiSnapshot {
  /** Local "today" (YYYY-MM-DD) — the carried-over cut-off for deferOverdue. */
  today: string
  /** ALL to-dos, trashed ones included (restoreTodo targets those). */
  todos: ReadonlyArray<{
    id: string
    text: string
    done: boolean
    trashed?: boolean
    seriesId?: string
    dueDate?: string
    /** The row's current rule — Mochi's rule has no end date / set-pos, so
     * those are carried over from here (see mergeAgentRecurrence). */
    recurrence?: Recurrence
    subtasks?: ReadonlyArray<{ id: string; text: string; done: boolean }>
  }>
  /** `label` is the STORED label (empty for a built-in that shows its
   * localized name); `displayLabel` is what the user sees, so a
   * `newCategoryLabel` matches it. */
  categories: ReadonlyArray<{
    id: string
    label: string
    displayLabel?: string
    color: string
    icon: string
  }>
  groceries: ReadonlyArray<{ id: string; text: string; checked?: boolean }>
}

export interface MochiPlanDeps {
  /** Mints reminder ids (the model can't mint stable UUIDs). */
  genId: () => string
}

/** A to-do's category: an existing id, or the category an earlier
 * `addCategory` intent in the SAME plan creates (matched by label,
 * case-insensitively — the executor maps it to the id the store returned). */
export type CategoryRef = { id: string } | { newLabel: string }

/** One store call (or confirm dialog) the executor runs, in order. */
export type MochiIntent =
  | { type: 'addCategory'; label: string; color: string; icon: string }
  | {
      type: 'addTask'
      text: string
      priority: AgentPriority
      dueDate: string
      category?: CategoryRef
      recurrence?: AgentRecurrence
      notes?: string
      reminders?: Reminder[]
    }
  | { type: 'updateText'; todoId: string; text: string }
  | { type: 'updatePriority'; todoId: string; priority: AgentPriority }
  | { type: 'updateDueDate'; todoId: string; dueDate: string }
  | { type: 'updateCategory'; todoId: string; category: CategoryRef }
  | { type: 'updateNotes'; todoId: string; notes: string }
  /** The agent's rule merged over the row's current one (mergeAgentRecurrence). */
  | { type: 'updateRecurrence'; todoId: string; recurrence: Recurrence }
  | { type: 'updateReminders'; todoId: string; reminders: Reminder[] }
  | { type: 'addSubtask'; todoId: string; text: string }
  /** done ↔ open flip — only planned when it moves the right way. */
  | { type: 'toggle'; todoId: string }
  /** To the 30-day Done bin (recoverable) — Mochi never deletes permanently. */
  | { type: 'moveToTrash'; todoId: string }
  | { type: 'moveSeriesFutureToTrash'; todoId: string }
  /** A series instance: ask "just this one / this & future" (both → Trash). */
  | { type: 'askDeleteScope'; todoId: string; text: string }
  | { type: 'skipTodo'; todoId: string }
  | { type: 'skipSeriesFuture'; todoId: string }
  | { type: 'restoreFromTrash'; todoId: string }
  | { type: 'bulkDeferTodos'; todoIds: string[]; dueDate: string }
  | { type: 'toggleSubtask'; todoId: string; subtaskId: string }
  | { type: 'removeSubtask'; todoId: string; subtaskId: string }
  | { type: 'updateSubtaskText'; todoId: string; subtaskId: string; text: string }
  | { type: 'addGroceryStore'; name: string }
  | { type: 'renameGroceryStore'; from: string; to: string }
  | { type: 'deleteGroceryStore'; name: string }
  | { type: 'addGrocery'; text: string; groupId?: string; stores?: string[] }
  | {
      type: 'editGrocery'
      groceryId: string
      patch: { text?: string; stores?: string[]; groupId?: string }
    }
  | { type: 'toggleGroceryChecked'; groceryId: string }
  /** Shopping removal is permanent, so it always asks first. */
  | { type: 'askRemoveGrocery'; groceryId: string; text: string }
  | { type: 'editCategory'; categoryId: string; label: string; color: string; icon: string }
  | { type: 'deleteCategory'; categoryId: string }

/**
 * Agent reminders carry no id; stamp a fresh one per entry so the
 * scheduler's per-fire key stays distinct. Undefined for an empty/absent
 * list (= "leave reminders alone").
 */
export function stampReminders(
  rs: readonly AgentReminder[] | undefined,
  genId: () => string,
): Reminder[] | undefined {
  if (!rs || rs.length === 0) return undefined
  return rs.map((r) => ({
    id: genId(),
    at: r.at,
    ...(r.offsetMinutes ? { offsetMinutes: r.offsetMinutes } : {}),
    ...(r.intervalMinutes ? { intervalMinutes: r.intervalMinutes } : {}),
  }))
}

export type SubtaskMatch =
  | { kind: 'match'; id: string }
  | { kind: 'ambiguous' }
  | { kind: 'none' }

/**
 * Find the step the agent named: an exact (case/space-insensitive) match
 * first, then a UNIQUE prefix match. Several prefix hits are ambiguous — the
 * caller does nothing rather than guess (the old `includes()` + first-hit
 * matched "Call" to "Recall the plumber" before "Call the bank").
 */
export function matchSubtask(
  subtasks: ReadonlyArray<{ id: string; text: string }> | undefined,
  query: string,
): SubtaskMatch {
  const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase()
  const q = norm(query)
  if (!q || !subtasks || subtasks.length === 0) return { kind: 'none' }
  const exact = subtasks.filter((s) => norm(s.text) === q)
  if (exact.length === 1) return { kind: 'match', id: exact[0].id }
  if (exact.length > 1) return { kind: 'ambiguous' }
  const prefix = subtasks.filter((s) => norm(s.text).startsWith(q))
  if (prefix.length === 1) return { kind: 'match', id: prefix[0].id }
  return prefix.length > 1 ? { kind: 'ambiguous' } : { kind: 'none' }
}

/** Mutable per-plan state: categories this plan creates (lower-cased labels),
 * and the done / checked state each toggle planned so far leaves a target in
 * — so a repeated markDone (or step complete, or setGroceryChecked) in one
 * turn is a no-op instead of a second flip that cancels the first. */
interface PlanCtx {
  snap: MochiSnapshot
  deps: MochiPlanDeps
  creating: Set<string>
  out: MochiIntent[]
  todoDone: Map<string, boolean>
  stepDone: Map<string, boolean>
  groceryChecked: Map<string, boolean>
  /** To-dos an earlier op this turn skipped or sent to the bin — a later
   * markDone / edit / step op on them is a no-op (it would complete or edit
   * a row the user just closed). */
  closed: Set<string>
}

function newCtx(snap: MochiSnapshot, deps: MochiPlanDeps): PlanCtx {
  return {
    snap, deps, creating: new Set(), out: [],
    todoDone: new Map(), stepDone: new Map(), groceryChecked: new Map(),
    closed: new Set(),
  }
}

const stepKey = (todoId: string, stepId: string) => `${todoId}\u0000${stepId}`

type SnapTodo = MochiSnapshot['todos'][number]

/** A to-do's done state as of the intents planned so far. */
const plannedDone = (ctx: PlanCtx, td: SnapTodo): boolean =>
  ctx.todoDone.get(td.id) ?? td.done

/** Plan a toggle of `td` iff it isn't already (as planned) in `done`. A
 * to-do's toggle moves all its steps with it (todoToggle). */
function planTodoDone(ctx: PlanCtx, td: SnapTodo, done: boolean): void {
  if (plannedDone(ctx, td) === done) return
  ctx.out.push({ type: 'toggle', todoId: td.id })
  ctx.todoDone.set(td.id, done)
  for (const s of td.subtasks ?? []) ctx.stepDone.set(stepKey(td.id, s.id), done)
}

const labelKey = (label: string) => label.trim().toLowerCase()

/** Plan an `addCategory` for `label` unless this plan already creates it. */
function ensureCategory(ctx: PlanCtx, label: string, color?: string, icon?: string): void {
  const key = labelKey(label)
  if (ctx.creating.has(key)) return
  ctx.creating.add(key)
  ctx.out.push({
    type: 'addCategory',
    label: label.trim(),
    // Same rotation a manual add uses — the next palette color.
    color: color ?? COLOR_PALETTE[(ctx.snap.categories.length + ctx.creating.size - 1) % COLOR_PALETTE.length],
    icon: icon ?? 'tag',
  })
}

/**
 * Resolve an op's category. `newCategoryLabel` (a category created in the
 * same turn) wins: an existing category with that label (case-insensitive) is
 * reused; otherwise the createCategory op in this batch creates it — or, when
 * the batch has none, one is created here.
 */
function resolveCategory(
  ctx: PlanCtx,
  category: string | undefined,
  newCategoryLabel: string | undefined,
): CategoryRef | undefined {
  const label = newCategoryLabel?.trim()
  if (label) {
    const existing = ctx.snap.categories.find(
      (c) => labelKey(c.displayLabel || c.label) === labelKey(label) || labelKey(c.label) === labelKey(label),
    )
    if (existing) return { id: existing.id }
    ensureCategory(ctx, label)
    return { newLabel: label }
  }
  return category !== undefined ? { id: category } : undefined
}

const ruleList = (v: readonly number[] | undefined) => (v && v.length > 0 ? v.join(',') : '')

/** Same repeat rule AND end date (anchorDay is derived, so ignored). */
function sameRecurrence(a: Recurrence, b: Recurrence): boolean {
  return (
    a.freq === b.freq &&
    (a.interval ?? 1) === (b.interval ?? 1) &&
    ruleList(a.byWeekday) === ruleList(b.byWeekday) &&
    ruleList(a.bySetPos) === ruleList(b.bySetPos) &&
    (a.endDate ?? '') === (b.endDate ?? '')
  )
}

/**
 * The agent's rule over the row's `current` one. AgentRecurrence can't say
 * "until <date>" or "2nd Thursday", so the series' endDate is kept and its
 * bySetPos is kept while the result is still a monthly weekday rule —
 * otherwise a Mochi edit would silently drop them. An endDate already before
 * `fromDay` (the row's due day, or today when it's undated) is dropped: the
 * series has ended, and "repeat daily" on it means resume, which a past end
 * would block. Undefined when the merged rule is what the row already has
 * (nothing to apply).
 */
export function mergeAgentRecurrence(
  agent: AgentRecurrence,
  current: Recurrence | undefined,
  fromDay?: string,
): Recurrence | undefined {
  const merged: Recurrence = { freq: agent.freq }
  if (agent.interval !== undefined) merged.interval = agent.interval
  if (agent.byWeekday && agent.byWeekday.length > 0) merged.byWeekday = [...agent.byWeekday]
  if (current) {
    if (merged.freq === 'monthly' && merged.byWeekday && current.bySetPos && current.bySetPos.length > 0) {
      merged.bySetPos = [...current.bySetPos]
    }
    const from = fromDay ? dueDateOnly(fromDay) : ''
    if (current.endDate && !(from && current.endDate < from)) merged.endDate = current.endDate
    if (sameRecurrence(merged, current)) return undefined
  }
  return merged
}

type TodoPatch = NonNullable<OpOf<'pickTodos'>['args']['edit']> & { newCategoryLabel?: string }

/** The field-by-field edit of one to-do (editTodo and a pick-list edit). */
function planTodoPatch(ctx: PlanCtx, todoId: string, e: TodoPatch): void {
  const out = ctx.out
  if (e.text !== undefined) out.push({ type: 'updateText', todoId, text: e.text })
  if (e.priority !== undefined) out.push({ type: 'updatePriority', todoId, priority: e.priority })
  // '' is an explicit "clear the date" (server-gated to a user ask).
  if (e.dueDate !== undefined) out.push({ type: 'updateDueDate', todoId, dueDate: e.dueDate })
  const category = resolveCategory(ctx, e.category, e.newCategoryLabel)
  if (category) out.push({ type: 'updateCategory', todoId, category })
  if (e.notes !== undefined) out.push({ type: 'updateNotes', todoId, notes: e.notes })
  if (e.recurrence !== undefined) {
    const row = ctx.snap.todos.find((t) => t.id === todoId)
    // The row's day once this edit lands (a same-edit dueDate goes first).
    const day = (e.dueDate || row?.dueDate || ctx.snap.today) ?? ''
    const recurrence = mergeAgentRecurrence(e.recurrence, row?.recurrence, day)
    if (recurrence) out.push({ type: 'updateRecurrence', todoId, recurrence })
  }
  const reminders = stampReminders(e.reminders, ctx.deps.genId)
  if (reminders) out.push({ type: 'updateReminders', todoId, reminders })
}

const liveTodo = (snap: MochiSnapshot, id: string) =>
  snap.todos.find((t) => t.id === id && !t.trashed)

/** A live to-do no earlier op this turn has skipped / binned. */
const openTodo = (ctx: PlanCtx, id: string) =>
  ctx.closed.has(id) ? undefined : liveTodo(ctx.snap, id)

/** `td` and — for "this & future" on a series — its later live siblings
 * are closed for the rest of the turn. */
function closeTodo(ctx: PlanCtx, td: SnapTodo, future: boolean): void {
  ctx.closed.add(td.id)
  if (!future || !td.seriesId) return
  const from = dueDateOnly(td.dueDate)
  for (const t of ctx.snap.todos) {
    if (t.seriesId === td.seriesId && !t.trashed && dueDateOnly(t.dueDate) >= from) ctx.closed.add(t.id)
  }
}

function planOne(ctx: PlanCtx, op: ProposedOperation): void {
  const { snap, out } = ctx
  switch (op.kind) {
    case 'createTodo': {
      const a = op.args
      const category = resolveCategory(ctx, a.category, a.newCategoryLabel)
      const reminders = stampReminders(a.reminders, ctx.deps.genId)
      out.push({
        type: 'addTask',
        text: a.text,
        priority: a.priority ?? 'medium',
        dueDate: a.dueDate ?? '',
        ...(category ? { category } : {}),
        ...(a.recurrence ? { recurrence: a.recurrence } : {}),
        ...(a.notes ? { notes: a.notes } : {}),
        ...(reminders ? { reminders } : {}),
      })
      return
    }
    case 'editTodo': {
      if (!openTodo(ctx, op.args.todoId)) return
      planTodoPatch(ctx, op.args.todoId, op.args)
      return
    }
    case 'addSteps': {
      if (!openTodo(ctx, op.args.todoId)) return
      for (const s of op.args.steps) {
        if (s.text.trim()) out.push({ type: 'addSubtask', todoId: op.args.todoId, text: s.text })
      }
      return
    }
    case 'markDone': {
      // `toggle` flips unconditionally — markDone means "make it done",
      // never "re-open it" (also not after an earlier op in this turn).
      const td = openTodo(ctx, op.args.todoId)
      if (td) planTodoDone(ctx, td, true)
      return
    }
    case 'markUndone': {
      // A completed to-do sits in the Done bin (done ⇒ trashed), so look it
      // up among binned rows too — liveTodo would never find it. A to-do
      // marked done earlier in this same turn counts as done.
      const td = snap.todos.find((t) => t.id === op.args.todoId)
      if (td && (td.done || ctx.todoDone.has(td.id))) planTodoDone(ctx, td, false)
      return
    }
    case 'createCategory':
      // Hoisted by planMochiOps so same-turn to-dos can reference it.
      ensureCategory(ctx, op.args.label, op.args.color, op.args.icon)
      return
    case 'createStore':
      out.push({ type: 'addGroceryStore', name: op.args.name })
      return
    case 'addGroceryItem': {
      const a = op.args
      out.push({ type: 'addGrocery', text: a.text, groupId: a.groupId, stores: a.stores })
      return
    }
    case 'deleteTodo': {
      // Always to the 30-day Done bin — an AI misreading must be recoverable.
      // A series instance asks the scope.
      const td = openTodo(ctx, op.args.todoId)
      if (!td) return
      out.push(
        td.seriesId
          ? { type: 'askDeleteScope', todoId: td.id, text: td.text }
          : { type: 'moveToTrash', todoId: td.id },
      )
      closeTodo(ctx, td, false)
      return
    }
    case 'deleteGroceryItem': {
      const item = snap.groceries.find((g) => g.id === op.args.groceryId)
      if (item) out.push({ type: 'askRemoveGrocery', groceryId: item.id, text: item.text })
      return
    }
    case 'pickTodos':
      // Needs the user's ticked subset — applied via planPickedTodos.
      return
    case 'editGroceryItem': {
      const a = op.args
      if (!snap.groceries.some((g) => g.id === a.groceryId)) return
      out.push({
        type: 'editGrocery',
        groceryId: a.groceryId,
        patch: {
          ...(a.text !== undefined ? { text: a.text } : {}),
          ...(a.stores !== undefined ? { stores: a.stores } : {}),
          ...(a.groupId !== undefined ? { groupId: a.groupId } : {}),
        },
      })
      return
    }
    case 'editCategory': {
      // The store replaces all three fields — merge the patch over the
      // current values. Use the STORED label (empty keeps a built-in's
      // localized fallback), not the display label.
      const a = op.args
      const cat = snap.categories.find((c) => c.id === a.categoryId)
      if (!cat) return
      out.push({
        type: 'editCategory',
        categoryId: cat.id,
        label: a.label ?? cat.label,
        color: a.color ?? cat.color,
        icon: a.icon ?? cat.icon,
      })
      return
    }
    case 'deleteCategory':
      // The store cascades (reassigns to-dos) + guards the last category.
      if (snap.categories.some((c) => c.id === op.args.categoryId)) {
        out.push({ type: 'deleteCategory', categoryId: op.args.categoryId })
      }
      return
    case 'setGroceryChecked': {
      const item = snap.groceries.find((g) => g.id === op.args.groceryId)
      if (item && (ctx.groceryChecked.get(item.id) ?? !!item.checked) !== op.args.checked) {
        out.push({ type: 'toggleGroceryChecked', groceryId: item.id })
        ctx.groceryChecked.set(item.id, op.args.checked)
      }
      return
    }
    case 'renameStore':
      out.push({ type: 'renameGroceryStore', from: op.args.from, to: op.args.to })
      return
    case 'deleteStore':
      out.push({ type: 'deleteGroceryStore', name: op.args.name })
      return
    case 'skipTodo': {
      const td = openTodo(ctx, op.args.todoId)
      if (!td) return
      const future = op.args.scope === 'series' && !!td.seriesId
      out.push(future ? { type: 'skipSeriesFuture', todoId: td.id } : { type: 'skipTodo', todoId: td.id })
      closeTodo(ctx, td, future)
      return
    }
    case 'deferOverdue': {
      const overdue = snap.todos
        .filter((t) => !t.done && !t.trashed && !!t.dueDate && dueDateOnly(t.dueDate) < snap.today)
        .map((t) => t.id)
      if (overdue.length > 0) out.push({ type: 'bulkDeferTodos', todoIds: overdue, dueDate: op.args.dueDate })
      return
    }
    case 'restoreTodo': {
      const td = snap.todos.find((t) => t.id === op.args.todoId)
      if (td?.trashed) out.push({ type: 'restoreFromTrash', todoId: td.id })
      return
    }
    case 'subtaskAction': {
      const a = op.args
      const td = openTodo(ctx, a.todoId)
      if (!td) return
      const m = matchSubtask(td.subtasks, a.subtaskText)
      if (m.kind !== 'match') return
      const sub = td.subtasks!.find((s) => s.id === m.id)!
      const key = stepKey(td.id, sub.id)
      const subDone = ctx.stepDone.get(key) ?? sub.done
      if ((a.action === 'complete' && !subDone) || (a.action === 'uncomplete' && subDone)) {
        out.push({ type: 'toggleSubtask', todoId: td.id, subtaskId: sub.id })
        ctx.stepDone.set(key, !subDone)
      } else if (a.action === 'remove') {
        out.push({ type: 'removeSubtask', todoId: td.id, subtaskId: sub.id })
      } else if (a.action === 'rename' && a.newText?.trim()) {
        out.push({ type: 'updateSubtaskText', todoId: td.id, subtaskId: sub.id, text: a.newText })
      }
      return
    }
    default: {
      // Exhaustive: a new op kind fails to compile until it's planned.
      const unhandled: never = op
      void unhandled
    }
  }
}

/**
 * Plan a confirmed batch (one assistant turn). createCategory ops run FIRST
 * so a to-do in the same turn can land in the new category whatever order
 * the model listed them in; everything else keeps its order.
 */
export function planMochiOps(
  ops: readonly ProposedOperation[],
  snap: MochiSnapshot,
  deps: MochiPlanDeps,
): MochiIntent[] {
  const ctx = newCtx(snap, deps)
  for (const op of ops) if (op.kind === 'createCategory') planOne(ctx, op)
  for (const op of ops) if (op.kind !== 'createCategory') planOne(ctx, op)
  return ctx.out
}

/** Plan a single op (a one-op batch). */
export function planMochiOp(
  op: ProposedOperation,
  snap: MochiSnapshot,
  deps: MochiPlanDeps,
): MochiIntent[] {
  return planMochiOps([op], snap, deps)
}

/**
 * Plan a pick-list proposal against the user's TICKED ids. Ids that aren't a
 * live to-do are dropped; delete → Done bin; markDone only flips open ones.
 */
export function planPickedTodos(
  op: OpOf<'pickTodos'>,
  ids: readonly string[],
  snap: MochiSnapshot,
  deps: MochiPlanDeps,
): MochiIntent[] {
  const ctx = newCtx(snap, deps)
  const live = ids.filter((id, i) => ids.indexOf(id) === i && !!liveTodo(snap, id))
  const { action } = op.args
  for (const id of live) {
    if (action === 'delete') {
      ctx.out.push({ type: 'moveToTrash', todoId: id })
    } else if (action === 'markDone') {
      planTodoDone(ctx, liveTodo(snap, id)!, true)
    } else if (action === 'edit') {
      if (op.args.edit) planTodoPatch(ctx, id, op.args.edit)
    } else {
      for (const s of op.args.steps ?? []) {
        if (s.text.trim()) ctx.out.push({ type: 'addSubtask', todoId: id, text: s.text })
      }
    }
  }
  return ctx.out
}
