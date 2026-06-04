/**
 * Tests for the JSON export helpers in core/src/exporter.ts.
 * Drives the new "Export data" surface in Settings.
 */
import { describe, expect, it } from 'vitest'
import {
  buildExportPayload,
  serializeExport,
  isExportEmpty,
  EXPORT_VERSION,
} from '../../core/src/data/exporter'
import type { Todo } from '../../core/src/domain/types'
import type { Profile } from '../../core/src/data/profile'

const sampleTodo: Todo = {
  id: 't1',
  text: 'Water plants',
  done: false,
  priority: 'medium',
  dueDate: '2026-05-28',
  trashed: false,
  updatedAt: 1,
}

const sampleProfile: Profile = {
  name: 'Sample',
  avatar: { kind: 'preset', key: 'mochi' },
}

describe('buildExportPayload', () => {
  it('includes only the entities that are non-empty', () => {
    const out = buildExportPayload({
      todos: [sampleTodo],
      categories: [],
      profile: sampleProfile,
      now: 1700000000000,
    })
    expect(out.version).toBe(EXPORT_VERSION)
    expect(out.exportedAt).toBe(1700000000000)
    expect(out.app.name).toBe('Sagely')
    expect(out.data.todos).toHaveLength(1)
    expect(out.data.categories).toBeUndefined()
    expect(out.data.profile).toEqual(sampleProfile)
    expect(out.data.groceries).toBeUndefined()
  })

  it('records appVersion when supplied', () => {
    const out = buildExportPayload({
      profile: sampleProfile,
      appVersion: '1.4.0',
      now: 0,
    })
    expect(out.app.appVersion).toBe('1.4.0')
  })

  it('uses Date.now() when no now override is given', () => {
    const before = Date.now()
    const out = buildExportPayload({ profile: sampleProfile })
    const after = Date.now()
    expect(out.exportedAt).toBeGreaterThanOrEqual(before)
    expect(out.exportedAt).toBeLessThanOrEqual(after)
  })

  it('an empty input still produces a valid wrapper', () => {
    const out = buildExportPayload({ now: 1 })
    expect(out.version).toBe(EXPORT_VERSION)
    expect(out.data).toEqual({})
  })
})

describe('serializeExport', () => {
  it('returns pretty-printed JSON the caller can hand to a share sheet', () => {
    const out = buildExportPayload({ profile: sampleProfile, now: 42 })
    const json = serializeExport(out)
    expect(json.startsWith('{\n')).toBe(true)
    const parsed = JSON.parse(json)
    expect(parsed.exportedAt).toBe(42)
    expect(parsed.data.profile.name).toBe('Sample')
  })
})

describe('isExportEmpty', () => {
  it('true when only the wrapper is present', () => {
    expect(isExportEmpty(buildExportPayload({ now: 0 }))).toBe(true)
  })
  it('false when a profile is present', () => {
    expect(
      isExportEmpty(buildExportPayload({ profile: sampleProfile, now: 0 })),
    ).toBe(false)
  })
  it('false when only todos are present', () => {
    expect(
      isExportEmpty(buildExportPayload({ todos: [sampleTodo], now: 0 })),
    ).toBe(false)
  })
  it('ignores empty arrays — those omit themselves from the payload', () => {
    expect(
      isExportEmpty(
        buildExportPayload({
          todos: [],
          categories: [],
          groceries: [],
          groceryGroups: [],
          todoReferences: [],
          now: 0,
        }),
      ),
    ).toBe(true)
  })
})
