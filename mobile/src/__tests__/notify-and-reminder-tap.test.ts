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
}))

import { runNewestFirst } from '../app/notify'
import { onReminderTapped } from '../adapters/notifications'

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
