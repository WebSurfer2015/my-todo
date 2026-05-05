import React from 'react'
import Svg, { Path, Polyline, Rect, Circle, Line } from 'react-native-svg'

interface IconProps { size?: number; color?: string }

function makeIcon(render: (color: string) => React.ReactNode) {
  return function Icon({ size = 16, color = '#3C3C43' }: IconProps) {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        {render(color)}
      </Svg>
    )
  }
}

export const ICONS = {
  home: makeIcon(() => (
    <>
      <Path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
      <Polyline points="9,22 9,12 15,12 15,22" />
    </>
  )),
  school: makeIcon(() => (
    <>
      <Path d="M22 10v6M2 10l10-5 10 5-10 5z" />
      <Path d="M6 12v5c3 3 9 3 12 0v-5" />
    </>
  )),
  briefcase: makeIcon(() => (
    <>
      <Rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
      <Path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" />
    </>
  )),
  book: makeIcon(() => (
    <>
      <Path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
      <Path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
    </>
  )),
  star: makeIcon(() => (
    <Path d="M12 2l3 7 7 .5-5.5 4.5 2 7-6.5-4-6.5 4 2-7L2 9.5 9 9z" />
  )),
  heart: makeIcon(() => (
    <Path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
  )),
  flag: makeIcon(() => (
    <>
      <Path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <Line x1="4" y1="22" x2="4" y2="15" />
    </>
  )),
  tag: makeIcon(() => (
    <>
      <Path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" />
      <Line x1="7" y1="7" x2="7.01" y2="7" />
    </>
  )),
  music: makeIcon(() => (
    <>
      <Path d="M9 18V5l12-2v13" />
      <Circle cx="6" cy="18" r="3" />
      <Circle cx="18" cy="16" r="3" />
    </>
  )),
  dumbbell: makeIcon(() => (
    <>
      <Path d="M14.4 14.4L9.6 9.6" />
      <Path d="M18.657 21.485a2 2 0 11-2.829-2.828l-1.767 1.768a2 2 0 11-2.829-2.829l6.364-6.364a2 2 0 112.829 2.829l-1.768 1.767a2 2 0 112.828 2.829z" />
      <Path d="M21.5 21.5l-1.4-1.4" />
      <Path d="M3.9 3.9L2.5 2.5" />
      <Path d="M6.343 2.515a2 2 0 012.829 2.828l1.767-1.768a2 2 0 012.829 2.829L7.404 12.768a2 2 0 01-2.829-2.829l1.768-1.767a2 2 0 01-2.828-2.829z" />
    </>
  )),
  coffee: makeIcon(() => (
    <>
      <Path d="M18 8h1a4 4 0 010 8h-1" />
      <Path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4z" />
      <Line x1="6" y1="2" x2="6" y2="4" />
      <Line x1="10" y1="2" x2="10" y2="4" />
      <Line x1="14" y1="2" x2="14" y2="4" />
    </>
  )),
  dot: makeIcon((color) => (
    <Circle cx="12" cy="12" r="6" fill={color} />
  )),
}

export type IconKey = keyof typeof ICONS
export const ICON_KEYS: IconKey[] = Object.keys(ICONS) as IconKey[]
