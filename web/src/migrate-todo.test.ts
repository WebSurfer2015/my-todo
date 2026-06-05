import { describe, it, expect } from 'vitest'
import {
  migrateTodo,
  migrateTodos,
  makeMigrateTodoCtx,
} from '../../core/src/logic/derive'
import type { CategoryDef } from '../../core/src/data/categories'

/**
 * Locks in the per-item migrator extraction (docs/SPIKE-persistence-scale.md):
 * migrateTodo is the single sanitizer; migrateTodos runs it per element.
 * The per-item persistence read-cutover will run migrateTodo per Firestore
 * doc, so these guarantees must hold for one item in isolation.
 */
const CATS: CategoryDef[] = [
  { id: 'home', color: '#34C759', icon: 'house' },
  { id: 'work', color: '#007AFF', icon: 'briefcase' },
]

describe('migrateTodo (single-item sanitizer)', () => {
  it('returns null for non-object input', () => {
    const ctx = makeMigrateTodoCtx(CATS)
    expect(migrateTodo(null, ctx)).toBeNull()
    expect(migrateTodo(42, ctx)).toBeNull()
    expect(migrateTodo('x', ctx)).toBeNull()
    expect(migrateTodo([], ctx)).toBeNull()
  })

  it('sanitizes a valid item: keeps id, defaults priority, validates category', () => {
    const ctx = makeMigrateTodoCtx(CATS)
    const out = migrateTodo({ id: 'a', text: 'buy milk', category: 'home' }, ctx)
    expect(out).not.toBeNull()
    expect(out!.id).toBe('a')
    expect(out!.text).toBe('buy milk')
    expect(out!.priority).toBe('medium') // default
    expect(out!.category).toBe('home')
  })

  it('drops an unknown category id when categories are supplied', () => {
    const ctx = makeMigrateTodoCtx(CATS)
    const out = migrateTodo({ id: 'a', text: 't', category: 'ghost' }, ctx)
    expect(out!.category).toBeUndefined()
  })

  it('returns null for a trashed item past the 30-day retention cutoff', () => {
    const ctx = makeMigrateTodoCtx(CATS)
    const old = ctx.now - 40 * 24 * 60 * 60 * 1000 // 40 days ago
    expect(migrateTodo({ id: 'a', text: 't', trashed: true, trashedAt: old }, ctx)).toBeNull()
  })

  it('keeps a recently-trashed item', () => {
    const ctx = makeMigrateTodoCtx(CATS)
    const recent = ctx.now - 1 * 24 * 60 * 60 * 1000 // yesterday
    const out = migrateTodo({ id: 'a', text: 't', trashed: true, trashedAt: recent }, ctx)
    expect(out).not.toBeNull()
    expect(out!.trashed).toBe(true)
  })

  it('migrateTodos == per-item migrateTodo over the array (dedup by updatedAt)', () => {
    const arr = [
      { id: 'a', text: 'first', updatedAt: 1 },
      { id: 'a', text: 'second', updatedAt: 2 }, // higher updatedAt wins
      { id: 'b', text: 'other' },
      null, // dropped
    ]
    const result = migrateTodos(arr, CATS)
    const byId = Object.fromEntries(result.map((t) => [t.id, t.text]))
    expect(byId).toEqual({ a: 'second', b: 'other' })
    expect(result.length).toBe(2)
  })
})
