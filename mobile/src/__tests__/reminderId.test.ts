import { describe, it, expect } from 'vitest'
import {
  REMINDER_ID_PREFIX,
  reminderIdFor,
  todoIdFromReminderId,
  fireIndexFromReminderId,
} from '../adapters/reminderId'

const UUID = '550e8400-e29b-41d4-a716-446655440000'

describe('reminder id scheme', () => {
  it('builds todo:<todoId>:<reminderId>:<fireIndex>', () => {
    expect(reminderIdFor(UUID, 'r1', 3)).toBe(`${REMINDER_ID_PREFIX}${UUID}:r1:3`)
  })

  it('round-trips todoId and fireIndex for a simple id', () => {
    const id = reminderIdFor(UUID, 'r1', 7)
    expect(todoIdFromReminderId(id)).toBe(UUID)
    expect(fireIndexFromReminderId(id)).toBe(7)
  })

  it('extracts todoId as the FIRST segment even when reminderId contains colons', () => {
    // legacy synthesized reminderId form: `legacy:<at>`
    const id = reminderIdFor(UUID, 'legacy:2026-06-05T09:00', 2)
    expect(todoIdFromReminderId(id)).toBe(UUID)
    // fireIndex is the LAST segment, unaffected by colons in reminderId
    expect(fireIndexFromReminderId(id)).toBe(2)
  })

  it('returns null for ids without the prefix', () => {
    expect(todoIdFromReminderId('other:abc:1')).toBeNull()
    expect(fireIndexFromReminderId('other:abc:1')).toBeNull()
  })

  it('returns null fireIndex when the last segment is non-numeric', () => {
    expect(fireIndexFromReminderId(`${REMINDER_ID_PREFIX}${UUID}:r1:notanum`)).toBeNull()
  })

  it('returns null todoId when there is no colon after the prefix', () => {
    expect(todoIdFromReminderId(REMINDER_ID_PREFIX + UUID)).toBeNull()
  })
})
