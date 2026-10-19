import { beforeEach, describe, expect, it, vi } from 'vitest'

const scheduled: Array<{ identifier: string; content: { title: string; body: string }; trigger: { date: Date } }> = []
vi.mock('expo-notifications', () => ({
  getPermissionsAsync: vi.fn(async () => ({ status: 'granted' })),
  getAllScheduledNotificationsAsync: vi.fn(async () => []),
  cancelScheduledNotificationAsync: vi.fn(async () => {}),
  scheduleNotificationAsync: vi.fn(async (req: (typeof scheduled)[number]) => {
    scheduled.push(req)
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

  it('done to-dos get neither', async () => {
    await syncTodoReminders([{ ...TODO, done: true }], { gentleNudge: true })
    expect(scheduled).toHaveLength(0)
  })
})
