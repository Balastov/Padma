import {
  BookOpen,
  Briefcase,
  Globe,
  GraduationCap,
  HeartPulse,
  House,
  Laptop,
  Leaf,
  Link2,
  MessageCircle,
  Mic,
  Palette,
  PenLine,
  Plane,
  Puzzle,
  Scale,
  Shapes,
  Smile,
  Sparkles,
  Type,
  Users,
  UtensilsCrossed,
  Volleyball,
  Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// Icon and hue for a topic, picked from keywords of its (English or Russian)
// title, until teachers can upload pictures.
const RULES: [RegExp, LucideIcon, number][] = [
  [/travel|touris|путешеств|транспорт/i, Plane, 205],
  [/people|люди|отношен/i, Users, 345],
  [/home|daily life|дом|повседнев/i, House, 28],
  [/food|еда|кулинар/i, UtensilsCrossed, 12],
  [/health|здоров|медицин/i, HeartPulse, 355],
  [/work|business|school|workplace|работа|бизнес/i, Briefcase, 265],
  [/learning|education|study|учеб|образован|изучен/i, GraduationCap, 230],
  [/world|nature|environment|природ|мир|погод|окружающ/i, Leaf, 140],
  [/technolog|communication|связь|технолог|медиа/i, Laptop, 220],
  [/leisure|sport|entertain|досуг|развлеч/i, Volleyball, 250],
  [/art|culture|искусств|культур/i, Palette, 300],
  [/feeling|чувств|эмоц/i, Smile, 40],
  [/social|society|общество|политик|проблем/i, Scale, 190],
  [/grammar|words and|граммат|части речи/i, Type, 235],
  [/verb|глагол/i, Zap, 45],
  [/phrase|idiom|фраз|идиом|коллокац/i, MessageCircle, 280],
  [/connect|link|связк|логик/i, Link2, 175],
  [/formation|словообраз/i, Puzzle, 160],
  [/style|register|стиль|регистр|письм/i, PenLine, 320],
  [/pronunciation|произнош|звук/i, Mic, 330],
  [/concept|понятия|числа|count|количеств/i, Shapes, 60],
  [/functional|функциональн/i, Sparkles, 270],
  [/countr|nation|страны/i, Globe, 200],
]

export function topicLook(title: string): { Icon: LucideIcon; hue: number } {
  for (const [rule, Icon, hue] of RULES)
    if (rule.test(title)) return { Icon, hue }
  return { Icon: BookOpen, hue: 230 }
}
