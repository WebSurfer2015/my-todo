/**
 * - notify.runNewestFirst: a merged "Undo all" unwinds newest → oldest.
 * - notifications.onReminderTapped: routes a reminder tap (live or the
 *   cold-launch response) to its todoId once. expo-notifications is mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const en = vi.hoisted(() => ({
  listener: null as null | ((r: unknown) => void),
  last: null as unknown,
  remove: () => {},
  clear: () => Promise.resolve(),
  scheduled: [] as string[],
  cancelled: [] as string[],
  presented: [] as string[],
  dismissed: [] as string[],
  newlyScheduled: [] as string[],
  // Resolves getAllScheduledNotificationsAsync — swap in a gate to hold a sync.
  gate: null as null | Promise<void>,
}))

vi.mock('expo-notifications', () => ({
  DEFAULT_ACTION_IDENTIFIER: 'expo.modules.notifications.actions.DEFAULT',
  setNotificationHandler: () => {},
  addNotificationResponseReceivedListener: (l: (r: unknown) => void) => {
    en.listener = l
    return { remove: () => en.remove() }
  },
  getLastNotificationResponseAsync: () => Promise.resolve(en.last),
  clearLastNotificationResponseAsync: () => en.clear(),
  SchedulableTriggerInputTypes: { DATE: 'date' },
  getPermissionsAsync: () => Promise.resolve({ status: 'granted' }),
  getAllScheduledNotificationsAsync: async () => {
    if (en.gate) await en.gate
    return en.scheduled.map((identifier) => ({ identifier, content: { data: {} } }))
  },
  scheduleNotificationAsync: (req: { identifier: string }) => {
    en.newlyScheduled.push(req.identifier)
    en.scheduled.push(req.identifier)
    return Promise.resolve(req.identifier)
  },
  getPresentedNotificationsAsync: () =>
    Promise.resolve(en.presented.map((identifier) => ({ request: { identifier } }))),
  dismissNotificationAsync: (id: string) => {
    en.dismissed.push(id)
    return Promise.resolve()
  },
  cancelScheduledNotificationAsync: (id: string) => {
    en.cancelled.push(id)
    en.scheduled = en.scheduled.filter((k) => k !== id)
    return Promise.resolve()
  },
}))

import { runNewestFirst } from '../app/notify'
import { cancelAllReminders, onReminderTapped, syncTodoReminders } from '../adapters/notifications'

describe('cancelAllReminders', () => {
  beforeEach(() => {
    en.scheduled = []
    en.cancelled = []
    en.presented = []
    en.dismissed = []
    en.newlyScheduled = []
    en.gate = null
  })

  it('cancels every to-do reminder, nothing else', async () => {
    en.scheduled = ['todo:a:r:0', 'todo:a:nudge:0', 'other-app-thing']
    await cancelAllReminders()
    expect(en.cancelled.sort()).toEqual(['todo:a:nudge:0', 'todo:a:r:0'])
  })

  it('also clears already-delivered reminders from Notification Center', async () => {
    en.presented = ['todo:a:r:0', 'someone-else']
    await cancelAllReminders()
    expect(en.dismissed).toEqual(['todo:a:r:0'])
  })

  it('waits out an in-flight sync and drops a queued one — nothing is scheduled after', async () => {
    let open!: () => void
    en.gate = new Promise<void>((r) => { open = r })
    const at = new Date(Date.now() + 3_600_000).toISOString()
    const todo = (id: string) => ({ id, text: id, done: false, trashed: false, reminders: [{ id: 'r', at }] })
    void syncTodoReminders([todo('a')]) // in flight, held at the gate
    await Promise.resolve()
    void syncTodoReminders([todo('b')]) // queued behind it
    const cancelled = cancelAllReminders()
    let done = false
    void cancelled.then(() => { done = true })
    await Promise.resolve()
    expect(done).toBe(false) // still waiting for the in-flight sync
    open()
    await cancelled
    // The in-flight sync finished ('a'); the queued 'b' never ran.
    expect(en.newlyScheduled.filter((k) => k.startsWith('todo:b'))).toEqual([])
    await new Promise((r) => setTimeout(r, 10))
    // Nothing the sync scheduled survived the cancel.
    expect(en.scheduled.filter((k) => k.startsWith('todo:'))).toEqual([])
    expect(en.newlyScheduled.filter((k) => k.startsWith('todo:b'))).toEqual([])
  })
})

describe('runNewestFirst', () => {
  it('runs the latest action, then the accumulated ones in reverse', () => {
    const calls: string[] = []
    const mk = (n: string) => () => { calls.push(n) }
    runNewestFirst([mk('1'), mk('2'), mk('3')], mk('4'))()
    expect(calls).toEqual(['4', '3', '2', '1'])
  })
})

const response = (id: string, data: unknown, action = 'expo.modules.notifications.actions.DEFAULT') => ({
  actionIdentifier: action,
  notification: { date: 1000, request: { identifier: id, content: { data } } },
})

describe('onReminderTapped', () => {
  it('keeps de-duping recent taps after many responses (capped history)', () => {
    const onTodo = vi.fn()
    const stop = onReminderTapped(onTodo)
    for (let i = 0; i < 60; i++) en.listener!(response(`todo:x${i}:r:0`, { todoId: `x${i}` }))
    en.listener!(response('todo:x59:r:0', { todoId: 'x59' }))
    expect(onTodo).toHaveBeenCalledTimes(60)
    // The oldest fell out of the history (bounded memory).
    en.listener!(response('todo:x0:r:0', { todoId: 'x0' }))
    expect(onTodo).toHaveBeenCalledTimes(61)
    stop()
  })

  beforeEach(() => {
    en.listener = null
    en.last = null
  })

  it('routes a live tap to its todoId, once', async () => {
    const onTodo = vi.fn()
    const stop = onReminderTapped(onTodo)
    en.listener!(response('todo:a:r:0', { todoId: 'a' }))
    en.listener!(response('todo:a:r:0', { todoId: 'a' }))
    expect(onTodo.mock.calls).toEqual([['a']])
    stop()
  })

  it('routes the cold-launch response and clears it', async () => {
    const clear = vi.fn(() => Promise.resolve())
    en.clear = clear
    en.last = response('todo:b:r:0', { todoId: 'b' })
    const onTodo = vi.fn()
    const stop = onReminderTapped(onTodo)
    await vi.waitFor(() => expect(onTodo).toHaveBeenCalledWith('b'))
    await vi.waitFor(() => expect(clear).toHaveBeenCalled())
    stop()
  })

  it('ignores notifications without a todoId and non-default actions', () => {
    const onTodo = vi.fn()
    const stop = onReminderTapped(onTodo)
    en.listener!(response('sagely-daily-checkin', {}))
    en.listener!(response('todo:c:r:0', { todoId: 'c' }, 'dismiss'))
    expect(onTodo).not.toHaveBeenCalled()
    stop()
  })
})
