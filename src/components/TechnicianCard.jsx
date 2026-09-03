import { CheckCircle2, MapPin, Phone, Star } from 'lucide-react'
import CategoryIcon from './CategoryIcon'
import { Button, Chip, VerifiedBadge } from './ui'
import { initials } from '../lib/format'

/**
 * A directory listing. Everything above the button answers "can I trust this
 * person?"; the button answers "how do I reach them".
 *
 * There is deliberately no `tel:` or WhatsApp link here. The number is not
 * even loaded into the page — the directory reads a view that has no contact
 * column in it — so the only way to reach a karigar is through
 * `onContact`, which charges the karigar first.
 */
export default function TechnicianCard({ tech, index = 0, onContact, revealed = false }) {
  return (
    <article
      className="card animate-rise p-3.5"
      style={{ animationDelay: `${Math.min(index, 10) * 30}ms` }}
    >
      <div className="flex gap-3">
        {tech.avatar_url ? (
          <img
            src={tech.avatar_url}
            alt=""
            className="h-14 w-14 shrink-0 rounded-2xl object-cover"
            loading="lazy"
          />
        ) : (
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-royal-wash text-[17px] font-bold text-royal">
            {initials(tech.full_name)}
          </span>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <h3 className="min-w-0 flex-1 truncate text-[15px] font-bold leading-tight text-ink">
              {tech.shop_name || tech.full_name}
            </h3>
            <span className="tnum flex shrink-0 items-center gap-0.5 text-[13px] font-bold text-ink">
              <Star className="w-3.5 h-3.5 fill-amber text-amber" aria-hidden="true" />
              {tech.rating.toFixed(1)}
            </span>
          </div>

          <p className="truncate text-[12.5px] text-ink-soft">{tech.full_name}</p>

          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {tech.is_verified && <VerifiedBadge />}
            {tech.category_name && (
              <Chip tone="royal">
                <CategoryIcon name={tech.icon_name} className="w-3 h-3" strokeWidth={2.2} />
                {tech.category_name}
              </Chip>
            )}
            <Chip>
              <span className="tnum">{tech.experience_years}</span>
              {tech.experience_years === 1 ? ' yr' : ' yrs'}
            </Chip>
            {!tech.is_available && <Chip tone="alert">Busy today</Chip>}
          </div>

          <p className="mt-1.5 flex items-center gap-1 text-[12px] text-ink-muted">
            <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
            {tech.address_area}
          </p>
        </div>
      </div>

      <div className="mt-3">
        {tech.is_contactable === false ? (
          <div className="rounded-2xl border border-line bg-canvas px-3.5 py-3 text-center">
            <p className="text-[12.5px] font-semibold text-ink-soft">Filhaal available nahi</p>
          </div>
        ) : (
          <Button variant="action" size="md" full onClick={() => onContact?.(tech)}>
            {revealed ? (
              <>
                <CheckCircle2 className="w-4 h-4" strokeWidth={2.4} aria-hidden="true" />
                Number dekhein
              </>
            ) : (
              <>
                <Phone className="w-4 h-4" strokeWidth={2.4} aria-hidden="true" />
                Contact / Call Now
              </>
            )}
          </Button>
        )}
      </div>
    </article>
  )
}
