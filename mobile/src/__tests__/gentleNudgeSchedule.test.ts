import { beforeEach, describe, expect, it, vi } from 'vitest'

const scheduled: Array<{ identifier: string; content: { title: string; body: string; data: unknown }; trigger: { date: Date } }> = []
// What the OS currently holds — returned the way iOS does (a time-interval
// trigger with no `date`), which is why the scheduler compares data.atMs.
const pending = new Map<string, { identifier: string; content: unknown; trigger: unknown }>()
const cancelled: string[] = []
vi.mock('expo-notifications', () => ({
  getPermissionsAsync: vi.fn(async () => ({ status: 'granted' })),
  getAllScheduledNotificationsAsync: vi.fn(async () => [...pending.values()]),
  cancelScheduledNotificationAsync: vi.fn(async (id: string) => {
    cancelled.push(id)
    pending.delete(id)
  }),
  scheduleNotificationAsync: vi.fn(async (req: (typeof scheduled)[number]) => {
    scheduled.push(req)
    pending.set(req.identifier, { identifier: req.identifier, content: req.content, trigger: { type: 'timeInterval', seconds: 60, repeats: false } })
    return req.identifier
  }),
  SchedulableTriggerInputTypes: { DATE: 'date', DAILY: 'daily' },
  setNotificationHandler: vi.fn(),
}))

import { syncTodoReminders } from '../adapters/notifications'

const TODO = {
  id: 't1',
  text: 'Call the dentist',
  reminders: [{ id: 'r1', at: '2099-10-23T14:00' }],
  done: false,
  trashed: false,
}

describe('syncTodoReminders — Gentle nudge', () => {
  beforeEach(() => {
    scheduled.length = 0
    cancelled.length = 0
    pending.clear()
  })

  it('off (default): only the reminder itself', async () => {
    await syncTodoReminders([TODO])
    expect(scheduled.map((s) => s.content.body)).toEqual(['A gentle nudge from Mochi.'])
  })

  it('on: one follow-up at 9:00 the next morning, calm copy', async () => {
    await syncTodoReminders([TODO], { gentleNudge: true })
    expect(scheduled).toHaveLength(2)
    const nudge = scheduled.find((s) => s.identifier.includes(':nudge:'))!
    expect(nudge.content.title).toBe('Still on your list: Call the dentist')
    expect(nudge.trigger.date.getHours()).toBe(9)
    expect(nudge.trigger.date.getDate()).toBe(24)
  })

  it('a second identical sync changes nothing (iOS trigger shape)', async () => {
    await syncTodoReminders([TODO], { gentleNudge: true })
    scheduled.length = 0
    await syncTodoReminders([TODO], { gentleNudge: true })
    expect(scheduled).toHaveLength(0)
    expect(cancelled).toHaveLength(0)
  })

  it('caps pending notifications at 60, soonest first', async () => {
    const many = Array.from({ length: 80 }, (_, i) => ({
      ...TODO,
      id: `t${i}`,
      reminders: [{ id: 'r', at: `2099-01-01T${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}` }],
    }))
    await syncTodoReminders(many)
    expect(scheduled).toHaveLength(60)
    expect(scheduled.map((s) => s.identifier)).not.toContain(expect.stringContaining('t79'))
  })

  it('done to-dos get neither', async () => {
    await syncTodoReminders([{ ...TODO, done: true }], { gentleNudge: true })
    expect(scheduled).toHaveLength(0)
  })
})
