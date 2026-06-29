import React, { useState } from 'react'
import { Platform } from 'react-native'
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker'

/**
 * Android-only date / date+time entry.
 *
 * The community DateTimePicker on Android is an *imperative dialog*, not an
 * inline view: rendering it inline (the iOS model) pops the dialog on mount
 * and then strands the user in a sub-view with no visible picker after it
 * dismisses, and `mode="datetime"` is unsupported (the time is silently
 * dropped). This component auto-opens the native dialog on mount, chains
 * date → time when `mode === 'datetime'`, commits the chosen value via
 * `onCommit`, and always calls `onDone` so the caller can leave its picker
 * sub-view — mirroring the commit-on-set / close-on-dismiss pattern already
 * proven in TaskItem. Renders nothing on iOS (callers keep their inline
 * calendar for iOS).
 */
export default function AndroidDateFlow({
  value,
  mode,
  minimumDate,
  onCommit,
  onDone,
}: {
  value: Date
  mode: 'date' | 'datetime'
  minimumDate?: Date
  /** Fired only when the user confirms a value. */
  onCommit: (d: Date) => void
  /** Fired in all terminal cases (commit OR cancel) so the caller can close. */
  onDone: () => void
}) {
  // 1 = date step, 2 = time step (datetime only).
  const [step, setStep] = useState<1 | 2>(1)
  const [staged, setStaged] = useState<Date>(value)

  if (Platform.OS !== 'android') return null

  if (step === 1) {
    return (
      <DateTimePicker
        value={staged}
        mode="date"
        display="default"
        minimumDate={minimumDate}
        onChange={(e: DateTimePickerEvent, d?: Date) => {
          if (e.type !== 'set' || !d) {
            onDone()
            return
          }
          if (mode === 'datetime') {
            // Carry the existing time forward into the picked date, then ask
            // for the time in a second dialog.
            const next = new Date(d)
            next.setHours(staged.getHours(), staged.getMinutes(), 0, 0)
            setStaged(next)
            setStep(2)
          } else {
            onCommit(d)
            onDone()
          }
        }}
      />
    )
  }

  return (
    <DateTimePicker
      value={staged}
      mode="time"
      display="default"
      onChange={(e: DateTimePickerEvent, d?: Date) => {
        if (e.type === 'set' && d) {
          const final = new Date(staged)
          final.setHours(d.getHours(), d.getMinutes(), 0, 0)
          onCommit(final)
        } else {
          // Time cancelled — still commit the date the user already picked.
          onCommit(staged)
        }
        onDone()
      }}
    />
  )
}
