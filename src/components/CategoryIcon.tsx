import {
  Home, Building, Building2, School, GraduationCap, Briefcase, Hammer, Wrench, Code, Laptop, Monitor,
  Heart, Activity, Dumbbell, Pill, Stethoscope,
  DollarSign, CreditCard, Wallet, Banknote, PiggyBank,
  Mail, Phone, MessageCircle, MessageSquare,
  Clock, Calendar, AlarmClock, Hourglass, Watch,
  Coffee, Utensils, Pizza, Cake, Wine, Beer,
  Plane, Car, Bus, Train, Ship, Bike, Map as MapIcon, MapPin, Globe,
  Music, Headphones, Mic, Camera, Video, Gamepad2, Palette, Paintbrush,
  Leaf, TreePine, Sun, Moon, Cloud, Flower, Sprout,
  Dog, Cat, Rabbit, Fish, Bird,
  Star, Flag, Tag, Bookmark, Bell, Gift, Package, ShoppingCart, ShoppingBag,
  Zap, Sparkles, Target, Trophy, Award, Smile,
  Cpu, Database, Terminal, Bug,
  File, Folder, Book, BookOpen, Library, Newspaper, Pencil, Scissors,
  Settings, Search, Eye, Lock, Key, Shield, Anchor, Compass, Rocket,
  MoreHorizontal,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export const ICONS: Record<string, LucideIcon> = {
  'home': Home, 'building': Building, 'building-2': Building2, 'school': School, 'graduation-cap': GraduationCap,
  'briefcase': Briefcase, 'hammer': Hammer, 'wrench': Wrench, 'code': Code, 'laptop': Laptop, 'monitor': Monitor,
  'heart': Heart, 'activity': Activity, 'dumbbell': Dumbbell, 'pill': Pill, 'stethoscope': Stethoscope,
  'dollar-sign': DollarSign, 'credit-card': CreditCard, 'wallet': Wallet, 'banknote': Banknote, 'piggy-bank': PiggyBank,
  'mail': Mail, 'phone': Phone, 'message-circle': MessageCircle, 'message-square': MessageSquare,
  'clock': Clock, 'calendar': Calendar, 'alarm-clock': AlarmClock, 'hourglass': Hourglass, 'watch': Watch,
  'coffee': Coffee, 'utensils': Utensils, 'pizza': Pizza, 'cake': Cake, 'wine': Wine, 'beer': Beer,
  'plane': Plane, 'car': Car, 'bus': Bus, 'train': Train, 'ship': Ship, 'bike': Bike,
  'map': MapIcon, 'map-pin': MapPin, 'globe': Globe,
  'music': Music, 'headphones': Headphones, 'mic': Mic, 'camera': Camera, 'video': Video,
  'gamepad-2': Gamepad2, 'palette': Palette, 'paintbrush': Paintbrush,
  'leaf': Leaf, 'tree-pine': TreePine, 'sun': Sun, 'moon': Moon, 'cloud': Cloud, 'flower': Flower, 'sprout': Sprout,
  'dog': Dog, 'cat': Cat, 'rabbit': Rabbit, 'fish': Fish, 'bird': Bird,
  'star': Star, 'flag': Flag, 'tag': Tag, 'bookmark': Bookmark, 'bell': Bell,
  'gift': Gift, 'package': Package, 'shopping-cart': ShoppingCart, 'shopping-bag': ShoppingBag,
  'zap': Zap, 'sparkles': Sparkles, 'target': Target, 'trophy': Trophy, 'award': Award, 'smile': Smile,
  'cpu': Cpu, 'database': Database, 'terminal': Terminal, 'bug': Bug,
  'file': File, 'folder': Folder, 'book': Book, 'book-open': BookOpen, 'library': Library,
  'newspaper': Newspaper, 'pencil': Pencil, 'scissors': Scissors,
  'settings': Settings, 'search': Search, 'eye': Eye, 'lock': Lock, 'key': Key, 'shield': Shield,
  'anchor': Anchor, 'compass': Compass, 'rocket': Rocket,
  'more-horizontal': MoreHorizontal,
}

export const ICON_NAMES: string[] = Object.keys(ICONS).sort()

export const FALLBACK_ICON = 'more-horizontal'

export default function CategoryIcon({ icon, size = 15 }: { icon: string; size?: number }) {
  const Icon = ICONS[icon] ?? ICONS[FALLBACK_ICON]
  return <Icon size={size} strokeWidth={2} />
}
