import CategoryIcon from './CategoryIcon'
import { CATEGORY_TONE } from '../lib/constants'

/**
 * The signature element: a category rendered the way a D.I. Khan shop
 * signboard is painted. Roman Urdu is the primary line because that is what
 * a customer says out loud; the English name sits under it in small caps;
 * and the Urdu script is watermarked behind the icon, large and faint.
 *
 * The watermark does real work — it is the fastest thing to recognise for a
 * customer who reads Nastaliq more comfortably than Latin.
 */
export default function CategoryTile({ category, onClick, index = 0 }) {
  const tone = CATEGORY_TONE[category.icon_name] === 'amber' ? 'amber' : 'royal'

  const skin =
    tone === 'amber'
      ? 'bg-amber-wash border-amber/30 text-amber-deep'
      : 'bg-card border-line text-royal'

  return (
    <button
      type="button"
      onClick={onClick}
      className={`animate-rise press relative flex h-full min-h-[112px] w-full flex-col justify-between
        overflow-hidden rounded-[var(--radius-tile)] border p-3 text-left ${skin}`}
      style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}
    >
      {/* Nastaliq watermark. aria-hidden: the accessible name comes from the
          Roman + English lines below, so a screen reader is not read the
          same category three times. */}
      {/* Anchored flush right so the phrase starts on the tile and trails
          off to the left — Urdu reads right to left, so bleeding the right
          edge would cut the opening word. */}
      <span
        className="ur pointer-events-none absolute right-2 -top-2 select-none whitespace-nowrap text-[38px]
          leading-none opacity-[0.07]"
        aria-hidden="true"
      >
        {category.name_ur}
      </span>

      <CategoryIcon name={category.icon_name} className="relative w-7 h-7" strokeWidth={1.6} />

      <span className="relative mt-3 block">
        <span className="block text-[13px] font-bold leading-tight text-ink">
          {category.name_roman || category.name_en}
        </span>
        <span className="eyebrow mt-1 block text-ink-muted">{category.name_en}</span>
      </span>
    </button>
  )
}
