/**
 * Tiny lucide-icon component for grocery rows. Two kinds:
 *
 * - 'department' → a themed icon per built-in department id. Custom
 *   user-added departments (UUID ids) fall through to a generic Tag.
 * - 'store' → a single ShoppingBag icon for every store. Stores are
 *   user-named so per-store iconography isn't practical; keeping the
 *   icon constant lets the colors / labels do the discrimination.
 *
 * Colors come from the theme so dark mode looks right.
 */

import React from 'react'
import {
  Apple,
  Beef,
  Egg,
  Croissant,
  Snowflake,
  Wheat,
  Coffee,
  Home,
  Box,
  Tag,
  ShoppingBag,
} from 'lucide-react-native'
import { useTheme } from '../theme'
import { OTHERS_GROUP_ID } from '../groceries'
import { lookupDeptIcon } from './groceryDeptIcons'

type LucideIcon = typeof Apple

const DEPARTMENT_ICONS: Record<string, LucideIcon> = {
  produce:   Apple,
  meat:      Beef,
  dairy:     Egg,
  bakery:    Croissant,
  frozen:    Snowflake,
  pantry:    Wheat,
  beverages: Coffee,
  household: Home,
  [OTHERS_GROUP_ID]: Box,
}

/**
 * Distinct accent tone per built-in department, drawn from Sagely's
 * calm background-pair palette so the icons feel saturated enough to
 * differentiate at a glance without breaking the anxiety-conscious
 * low-chroma aesthetic. Custom user departments fall back to sage.
 */
const DEPARTMENT_COLORS: Record<string, string> = {
  produce:   '#7FB59E', // mint — fresh
  meat:      '#D87878', // soft coral — meaty
  dairy:     '#D9C28A', // honey — egg/butter
  bakery:    '#EFC9B0', // peach — warm pastry
  frozen:    '#86C5A8', // sea-glass mint — cool
  pantry:    '#C9B85F', // mustard — golden grains
  beverages: '#BFB4D0', // lavender — wine/grape
  household: '#9DB0A3', // sage — clean/quiet
  [OTHERS_GROUP_ID]: '#A8B0A5', // muted gray-sage
}

/**
 * Calm palette for stores — distinct from departments so the eye reads
 * "this is a store, not a department". Hashed by store name so the
 * same store always picks the same hue across renders + devices.
 */
const STORE_PALETTE: string[] = [
  '#A8C9B4', // mint
  '#E0B8B4', // misty rose
  '#A4C0BE', // sea-glass
  '#BFB4D0', // lavender
  '#EFC9B0', // peach
  '#D9C28A', // honey
  '#9DB0A3', // sage
]

function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

interface Props {
  kind: 'department' | 'store'
  /** Department id (for kind='department') or store name (for
   * kind='store'). Unknown department ids fall back to Tag/sage. */
  id: string
  /** Per-group custom icon key (from GROCERY_DEPT_ICONS). Wins over
   * the per-id defaults. Only meaningful for kind='department'. */
  customIcon?: string
  /** Per-group custom hex color. Wins over per-id defaults. */
  customColor?: string
  size?: number
  /** Final override color from caller (e.g. dim hidden rows). Wins
   * over customColor and the built-in maps. */
  color?: string
}

export default function GroceryIcon({
  kind,
  id,
  customIcon,
  customColor,
  size = 18,
  color,
}: Props) {
  const theme = useTheme()
  if (kind === 'store') {
    const tone =
      color ?? customColor ?? STORE_PALETTE[hashString(id) % STORE_PALETTE.length]
    return <ShoppingBag size={size} color={tone} strokeWidth={2} />
  }
  const CustomIcon = lookupDeptIcon(customIcon)
  const Icon = CustomIcon ?? DEPARTMENT_ICONS[id] ?? Tag
  const tone = color ?? customColor ?? DEPARTMENT_COLORS[id] ?? theme.label2
  return <Icon size={size} color={tone} strokeWidth={2} />
}
