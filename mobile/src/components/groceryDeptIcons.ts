/**
 * Curated grocery-department icon set. Strings are the stable keys that
 * persist on GroceryGroup.icon — the React component is the lucide
 * icon to render. Keep this list small + grocery-relevant so the icon
 * picker stays scannable and on-theme.
 *
 * If a saved icon key no longer exists in this registry (we renamed
 * one, say), GroceryIcon falls back to the built-in DEPARTMENT_ICONS
 * map keyed by group id, then to the `Tag` glyph.
 */

import {
  Apple,
  Beef,
  Egg,
  Milk,
  Croissant,
  Cake,
  Cookie,
  IceCream,
  Snowflake,
  Wheat,
  Coffee,
  Wine,
  Beer,
  Pizza,
  Soup,
  Sandwich,
  Fish,
  Drumstick,
  Carrot,
  Banana,
  Cherry,
  Salad,
  Pill,
  Sparkles,
  Baby,
  PawPrint,
  Home,
  Box,
  Tag,
  ShoppingBag,
  Flame,
  Leaf,
  Grape,
} from 'lucide-react-native'

type LucideIcon = typeof Apple

export interface GroceryDeptIconDef {
  key: string
  Icon: LucideIcon
}

export const GROCERY_DEPT_ICONS: GroceryDeptIconDef[] = [
  // produce / fresh
  { key: 'apple',     Icon: Apple },
  { key: 'banana',    Icon: Banana },
  { key: 'carrot',    Icon: Carrot },
  { key: 'cherry',    Icon: Cherry },
  { key: 'grape',     Icon: Grape },
  { key: 'salad',     Icon: Salad },
  { key: 'leaf',      Icon: Leaf },
  // protein
  { key: 'beef',      Icon: Beef },
  { key: 'fish',      Icon: Fish },
  { key: 'drumstick', Icon: Drumstick },
  { key: 'egg',       Icon: Egg },
  { key: 'milk',      Icon: Milk },
  // pantry / bakery
  { key: 'wheat',     Icon: Wheat },
  { key: 'croissant', Icon: Croissant },
  { key: 'pizza',     Icon: Pizza },
  { key: 'sandwich',  Icon: Sandwich },
  { key: 'soup',      Icon: Soup },
  { key: 'flame',     Icon: Flame },
  // sweets / frozen
  { key: 'cake',      Icon: Cake },
  { key: 'cookie',    Icon: Cookie },
  { key: 'ice-cream', Icon: IceCream },
  { key: 'snowflake', Icon: Snowflake },
  // beverages
  { key: 'coffee',    Icon: Coffee },
  { key: 'wine',      Icon: Wine },
  { key: 'beer',      Icon: Beer },
  // household / personal
  { key: 'home',      Icon: Home },
  { key: 'sparkles',  Icon: Sparkles },
  { key: 'pill',      Icon: Pill },
  { key: 'baby',      Icon: Baby },
  { key: 'paw',       Icon: PawPrint },
  // generic
  { key: 'shopping',  Icon: ShoppingBag },
  { key: 'box',       Icon: Box },
  { key: 'tag',       Icon: Tag },
]

export function lookupDeptIcon(key: string | undefined): LucideIcon | undefined {
  if (!key) return undefined
  return GROCERY_DEPT_ICONS.find((i) => i.key === key)?.Icon
}
