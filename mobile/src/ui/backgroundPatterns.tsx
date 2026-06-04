/**
 * Size-parameterized pattern renderers shared by `<BackgroundPicker />`
 * (tile-sized) and `<AppBackground />` (full-screen). Each renderer takes the
 * canvas width/height and the resolved color tones; nothing scales off
 * hard-coded TILE_W/TILE_H so the same code drives a 168×200 preview and a
 * 430×932 phone screen.
 *
 * The renderers are pure View+SVG — no animation, no measurement, no state.
 * Memoization is the caller's job (AppBackground memoizes by `(pattern, pairKey,
 * scheme, w, h)`).
 */

import React, { useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Svg, {
  Circle,
  Path,
  Polygon,
} from 'react-native-svg'
import type { PatternKey, PairTones } from './backgrounds'

// Deterministic LCG → identical render across re-renders / hot reloads.
function makeRng(seed: number) {
  let s = seed
  return () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
}

interface PatternProps {
  tones: PairTones
  width: number
  height: number
}

function Solid({ tones }: PatternProps) {
  return <View style={[StyleSheet.absoluteFill, { backgroundColor: tones.light }]} />
}

function Gradient({ tones }: PatternProps) {
  return (
    <LinearGradient
      colors={[tones.light, tones.deep]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={StyleSheet.absoluteFill}
    />
  )
}

function Blob({ tones, width: w, height: h }: PatternProps) {
  // Radii scale with the smaller side so a phone-screen render isn't dominated
  // by one giant blob.
  const r = Math.min(w, h) * 0.4
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: tones.light }]}>
      <Svg width={w} height={h}>
        <Circle cx={w * 0.25} cy={h * 0.35} r={r}        fill={tones.deep} opacity={0.35} />
        <Circle cx={w * 0.78} cy={h * 0.65} r={r * 0.8}  fill={tones.deep} opacity={0.28} />
        <Circle cx={w * 0.55} cy={h * 0.18} r={r * 0.48} fill={tones.deep} opacity={0.22} />
      </Svg>
    </View>
  )
}

function Wave({ tones, width: w, height: h }: PatternProps) {
  const y = h * 0.62
  const amp = Math.min(h * 0.06, 36)
  const d = `M0 ${y} C${w * 0.25} ${y - amp}, ${w * 0.55} ${y + amp}, ${w} ${y - amp * 0.2} L${w} ${h} L0 ${h} Z`
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: tones.light }]}>
      <Svg width={w} height={h}>
        <Path d={d} fill={tones.deep} opacity={0.55} />
      </Svg>
    </View>
  )
}

function Scatter({ tones, width: w, height: h }: PatternProps) {
  const dots = useMemo(() => {
    const rand = makeRng(42)
    // Density scales with area so a full-screen render has more dots than a tile.
    const area = w * h
    const count = Math.round(38 * (area / (168 * 200)))
    return Array.from({ length: count }, () => ({
      cx: rand() * w,
      cy: rand() * h,
      r: 1.2 + rand() * 2.6,
      o: 0.18 + rand() * 0.42,
    }))
  }, [w, h])
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: tones.light }]}>
      <Svg width={w} height={h}>
        {dots.map((d, i) => (
          <Circle key={i} cx={d.cx} cy={d.cy} r={d.r} fill={tones.deep} opacity={d.o} />
        ))}
      </Svg>
    </View>
  )
}

function LayeredWaves({ tones, width: w, height: h }: PatternProps) {
  const wavePath = (yMid: number, amp: number) =>
    `M0 ${yMid} C${w * 0.3} ${yMid - amp}, ${w * 0.7} ${yMid + amp}, ${w} ${yMid - amp * 0.4} L${w} ${h} L0 ${h} Z`
  const a = Math.min(h * 0.04, 24)
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: tones.light }]}>
      <Svg width={w} height={h}>
        <Path d={wavePath(h * 0.55, a * 1.0)} fill={tones.deep} opacity={0.22} />
        <Path d={wavePath(h * 0.72, a * 0.8)} fill={tones.deep} opacity={0.32} />
        <Path d={wavePath(h * 0.86, a * 0.55)} fill={tones.deep} opacity={0.48} />
      </Svg>
    </View>
  )
}

function StackedPeaks({ tones, width: w, height: h }: PatternProps) {
  const range = (baseY: number, amp: number, seed: number) => {
    const rand = makeRng(seed)
    const steps = 8
    const pts: string[] = [`0,${h}`]
    for (let i = 0; i <= steps; i++) {
      const x = (i / steps) * w
      const dy = (rand() - 0.5) * amp * 2
      pts.push(`${x},${baseY + dy}`)
    }
    pts.push(`${w},${h}`)
    return pts.join(' ')
  }
  const a = Math.min(h * 0.06, 36)
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: tones.light }]}>
      <Svg width={w} height={h}>
        <Polygon points={range(h * 0.45, a * 0.7, 11)} fill={tones.deep} opacity={0.22} />
        <Polygon points={range(h * 0.62, a * 1.0, 23)} fill={tones.deep} opacity={0.38} />
        <Polygon points={range(h * 0.80, a * 0.6, 37)} fill={tones.deep} opacity={0.62} />
      </Svg>
    </View>
  )
}

function LowPolyGrid({ tones, width: w, height: h }: PatternProps) {
  // Cell count adapts to canvas — keep ~5 cols on a tile, ~8 cols full-screen.
  const cols = Math.max(4, Math.round(w / 36))
  const rows = Math.max(5, Math.round(h / 36))
  const cellW = w / cols
  const cellH = h / rows
  const tris = useMemo(() => {
    const rand = makeRng(7)
    const grid: { x: number; y: number }[][] = []
    for (let r = 0; r <= rows; r++) {
      const row: { x: number; y: number }[] = []
      for (let c = 0; c <= cols; c++) {
        const jx = (rand() - 0.5) * cellW * 0.35
        const jy = (rand() - 0.5) * cellH * 0.35
        row.push({
          x: c === 0 || c === cols ? c * cellW : c * cellW + jx,
          y: r === 0 || r === rows ? r * cellH : r * cellH + jy,
        })
      }
      grid.push(row)
    }
    const out: { pts: string; o: number }[] = []
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const tl = grid[r][c], tr = grid[r][c + 1]
        const bl = grid[r + 1][c], br = grid[r + 1][c + 1]
        out.push({ pts: `${tl.x},${tl.y} ${tr.x},${tr.y} ${bl.x},${bl.y}`, o: 0.08 + rand() * 0.42 })
        out.push({ pts: `${tr.x},${tr.y} ${br.x},${br.y} ${bl.x},${bl.y}`, o: 0.08 + rand() * 0.42 })
      }
    }
    return out
  }, [cellH, cellW, cols, rows])
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: tones.light }]}>
      <Svg width={w} height={h}>
        {tris.map((t, i) => (
          <Polygon key={i} points={t.pts} fill={tones.deep} opacity={t.o} />
        ))}
      </Svg>
    </View>
  )
}

function CircleScatter({ tones, width: w, height: h }: PatternProps) {
  const circles = useMemo(() => {
    const rand = makeRng(91)
    const area = w * h
    const count = Math.round(9 * (area / (168 * 200)))
    const baseR = Math.min(w, h) * 0.08
    return Array.from({ length: count }, () => ({
      cx: rand() * w,
      cy: rand() * h,
      r: baseR + rand() * baseR * 2,
      o: 0.12 + rand() * 0.28,
    }))
  }, [w, h])
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: tones.light }]}>
      <Svg width={w} height={h}>
        {circles.map((c, i) => (
          <Circle key={i} cx={c.cx} cy={c.cy} r={c.r} fill={tones.deep} opacity={c.o} />
        ))}
      </Svg>
    </View>
  )
}

function ScatteredWaves({ tones, width: w, height: h }: PatternProps) {
  const waves = useMemo(() => {
    const rand = makeRng(173)
    const area = w * h
    const count = Math.round(14 * (area / (168 * 200)))
    return Array.from({ length: count }, () => {
      const x = rand() * w
      const y = 12 + rand() * (h - 24)
      const len = 18 + rand() * 26
      const amp = 3 + rand() * 4
      const d = `M${x} ${y} q${len * 0.25} ${-amp} ${len * 0.5} 0 t${len * 0.5} 0`
      return { d, o: 0.25 + rand() * 0.4 }
    })
  }, [w, h])
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: tones.light }]}>
      <Svg width={w} height={h}>
        {waves.map((wv, i) => (
          <Path
            key={i}
            d={wv.d}
            stroke={tones.deep}
            strokeWidth={1.4}
            strokeLinecap="round"
            fill="none"
            opacity={wv.o}
          />
        ))}
      </Svg>
    </View>
  )
}

export function renderPattern(pattern: PatternKey, props: PatternProps) {
  switch (pattern) {
    case 'solid':            return <Solid {...props} />
    case 'gradient':         return <Gradient {...props} />
    case 'blob':             return <Blob {...props} />
    case 'wave':             return <Wave {...props} />
    case 'scatter':          return <Scatter {...props} />
    case 'layered-waves':    return <LayeredWaves {...props} />
    case 'stacked-peaks':    return <StackedPeaks {...props} />
    case 'low-poly-grid':    return <LowPolyGrid {...props} />
    case 'circle-scatter':   return <CircleScatter {...props} />
    case 'scattered-waves':  return <ScatteredWaves {...props} />
  }
}
