import {
  AirVent,
  Car,
  Fuel,
  Hammer,
  PaintRoller,
  Droplets,
  WashingMachine,
  Wrench,
  Zap,
} from 'lucide-react'

/** Maps the seeded `categories.icon_name` to a glyph. Anything unrecognised
 *  falls back to a wrench rather than rendering nothing — a category added
 *  later from the admin side must never break the grid. */
const ICONS = {
  ac: AirVent,
  electric: Zap,
  plumb: Droplets,
  carpenter: Hammer,
  generator: Fuel,
  appliance: WashingMachine,
  painter: PaintRoller,
  auto: Car,
}

export default function CategoryIcon({ name, className = 'w-6 h-6', strokeWidth = 1.75 }) {
  const Glyph = ICONS[name] || Wrench
  return <Glyph className={className} strokeWidth={strokeWidth} aria-hidden="true" />
}
