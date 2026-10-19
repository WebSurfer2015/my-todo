import { describe, it, expect } from 'vitest'
import { mergeTodos } from '../src/store'
import type { Todo } from '../src/domain/types'

const td = (id: string, updatedAt: number, text = id): Todo => ({
  id,
  text,
  done: false,
  priority: 'medium',
  dueDate: '',
  trashed: false,
  updatedAt,
})
const ids = (list: Todo[]) => list.map((t) => `${t.id}:${t.text}`)

describe('mergeTodos', () => {
  it('newer updatedAt wins for an id on both sides', () => {
    const base = [td('a', 1), td('b', 1)]
    const local = [td('a', 5, 'a-local'), td('b', 1)]
    const remote = [td('a', 1), td('b', 7, 'b-remote')]
    expect(ids(mergeTodos(base, local, remote))).toEqual(['a:a-local', 'b:b-remote'])
  })

  it('a tie keeps the remote copy', () => {
    expect(ids(mergeTodos(null, [td('a', 3, 'L')], [td('a', 3, 'R')]))).toEqual(['a:R'])
  })

  it('keeps additions from both sides (local order first, remote-only appended)', () => {
    const base = [td('a', 1)]
    const local = [td('new-local', 9), td('a', 1)]
    const remote = [td('a', 1), td('new-remote', 8)]
    expect(ids(mergeTodos(base, local, remote))).toEqual([
      'new-local:new-local',
      'a:a',
      'new-remote:new-remote',
    ])
  })

  it('a remote delete wins over an unedited local copy', () => {
    const base = [td('a', 1), td('b', 1)]
    const local = [td('a', 1), td('b', 1), td('c', 4)]
    const remote = [td('a', 1)]
    expect(ids(mergeTodos(base, local, remote))).toEqual(['a:a', 'c:c'])
  })

  it('a local edit newer than the remote delete is kept', () => {
    expect(ids(mergeTodos([td('a', 1)], [td('a', 6, 'edited')], []))).toEqual(['a:edited'])
  })

  it('a local delete wins over an unedited remote copy but loses to a newer remote edit', () => {
    const base = [td('a', 1), td('b', 1)]
    const remote = [td('a', 1), td('b', 5, 'b-edited')]
    expect(ids(mergeTodos(base, [], remote))).toEqual(['b:b-edited'])
  })

  it('without a base it is a plain union (nothing is lost)', () => {
    expect(ids(mergeTodos(null, [td('a', 1)], [td('b', 1)]))).toEqual(['a:a', 'b:b'])
  })

  it('treats a missing updatedAt as oldest and leaves inputs untouched', () => {
    const noStamp: Todo = { ...td('a', 0), updatedAt: undefined }
    const local = [noStamp]
    expect(ids(mergeTodos(null, local, [td('a', 2, 'R')]))).toEqual(['a:R'])
    expect(local).toEqual([noStamp])
  })
})
