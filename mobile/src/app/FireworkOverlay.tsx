import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react'
import { StyleSheet, View } from 'react-native'
import CalmFirework from '../features/task/CalmFirework'

/**
 * App-level firework overlay. The completion celebration lives HERE rather
 * than inside the row, so the burst still plays when the row unmounts the
 * instant it's completed — e.g. a recurring row rolling forward, or any row
 * leaving under a strict filter. The in-row approach lost that feedback;
 * this restores it without bringing back the old flying-pebble system.
 *
 * Callers measure the tapped control's window position and call
 * `useTriggerFirework()({ x, y, color })`; we mount a one-shot CalmFirework
 * centered on that point and drop it when the animation finishes.
 */

interface BurstSpec {
  x: number
  y: number
  color?: string
}
interface Burst extends BurstSpec {
  id: number
}

const TriggerContext = createContext<(spec: BurstSpec) => void>(() => {})

/** Returns a function to fire a calm firework at a screen point. No-op
 * outside the provider, so callers never need to guard. */
export function useTriggerFirework() {
  return useContext(TriggerContext)
}

// Burst box size — big enough to contain the ~30px outward + downward drift
// so the particles never clip against the (non-clipping) overlay anyway.
const BOX = 100

export function FireworkOverlayProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [bursts, setBursts] = useState<Burst[]>([])
  const idRef = useRef(0)

  const trigger = useCallback((spec: BurstSpec) => {
    const id = (idRef.current += 1)
    setBursts((prev) => [...prev, { id, ...spec }])
  }, [])

  const remove = useCallback((id: number) => {
    setBursts((prev) => prev.filter((b) => b.id !== id))
  }, [])

  return (
    <TriggerContext.Provider value={trigger}>
      {children}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {bursts.map((b) => (
          <View
            key={b.id}
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: b.x - BOX / 2,
              top: b.y - BOX / 2,
              width: BOX,
              height: BOX,
            }}
          >
            <CalmFirework trigger={1} color={b.color} onDone={() => remove(b.id)} />
          </View>
        ))}
      </View>
    </TriggerContext.Provider>
  )
}
