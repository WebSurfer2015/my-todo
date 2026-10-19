/**
 * "Edit this only" detach policy (pure, unit-tested).
 *
 * A field edit on a series row in "this only" mode detaches the row from its
 * series (R6a) — except when the series was CREATED in this very details
 * session (a one-off made to repeat): detaching the head from its own new
 * series would leave a series that no longer follows its first row. Then the
 * edit goes to the whole (new) series instead.
 */
export type DetachDecision = 'none' | 'detach' | 'propagate'

export function detachOnEditDecision(input: {
  isSeriesRow: boolean
  alreadyDetached: boolean
  editMode: 'this' | 'series'
  /** The row's seriesId when details opened (undefined = it was a one-off). */
  entrySeriesId: string | undefined
  /** Repeat changes applied this session. */
  recurrenceSteps: number
}): DetachDecision {
  if (!input.isSeriesRow || input.editMode !== 'this') return 'none'
  if (!input.entrySeriesId && input.recurrenceSteps > 0) return 'propagate'
  return input.alreadyDetached ? 'none' : 'detach'
}
