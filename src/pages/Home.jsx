import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, MapPin, Search, Star, Timer } from 'lucide-react'
import CategoryTile from '../components/CategoryTile'
import CategoryIcon from '../components/CategoryIcon'
import { Button, SkeletonCard, VerifiedBadge } from '../components/ui'
import { listCategories, listTopTechnicians } from '../lib/db'
import { useSession } from '../store/session'
import { initials } from '../lib/format'

export default function Home() {
  const navigate = useNavigate()
  const { profile } = useSession()
  const [categories, setCategories] = useState([])
  const [pros, setPros] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [cats, top] = await Promise.all([listCategories(), listTopTechnicians(8)])
        if (!alive) return
        setCategories(cats)
        setPros(top)
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  function search(e) {
    e.preventDefault()
    const q = query.trim()
    navigate(q ? `/directory?q=${encodeURIComponent(q)}` : '/directory')
  }

  const firstName = profile?.full_name?.split(' ')[0]

  return (
    <div>
      {/* ── Header ───────────────────────────────────────────────── */}
      <header className="bg-royal px-5 pb-5 pt-4 text-white">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/12 px-3 py-1.5">
            <MapPin className="w-3.5 h-3.5 text-amber" strokeWidth={2.5} aria-hidden="true" />
            <span className="text-[13px] font-bold">Dera Ismail Khan</span>
          </span>
          {firstName && (
            <span className="truncate text-[13px] text-white/70">Assalam o Alaikum, {firstName}</span>
          )}
        </div>

        <form onSubmit={search} role="search" className="relative mt-3.5">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 w-[18px] h-[18px] -translate-y-1/2 text-ink-muted"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search AC, plumber, generator…"
            aria-label="Search karigars and services"
            enterKeyHint="search"
            className="tap w-full rounded-2xl border-0 bg-card py-3 pl-11 pr-4 text-[15px] text-ink
              placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-amber"
          />
        </form>
      </header>

      {/* ── Emergency banner ─────────────────────────────────────── */}
      <div className="px-5 pt-4">
        <button
          type="button"
          onClick={() => navigate('/directory?emergency=1')}
          className="press relative flex w-full items-center gap-3 overflow-hidden rounded-[var(--radius-card)]
            bg-alert p-4 text-left text-white shadow-sm"
        >
          {/* Second and last appearance of the truck-art ribbon. */}
          <span className="ribbon absolute inset-x-0 top-0 h-[3px] opacity-60" aria-hidden="true" />
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/18">
            <Timer className="w-6 h-6" strokeWidth={2.2} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="eyebrow block text-white/75">Emergency service</span>
            <span className="mt-0.5 block text-[15px] font-extrabold leading-tight">
              Instant repair within 20 minutes
            </span>
            <span className="mt-0.5 block text-[12px] text-white/80">
              Available karigars near you, right now
            </span>
          </span>
          <ChevronRight className="w-5 h-5 shrink-0" aria-hidden="true" />
        </button>
      </div>

      {/* ── Categories ───────────────────────────────────────────── */}
      <section className="px-5 pt-6" aria-labelledby="categories-heading">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 id="categories-heading" className="text-[17px] font-extrabold tracking-tight text-ink">
            Kaam chunein
          </h2>
          <span className="eyebrow text-ink-muted">Choose a service</span>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonCard key={i} className="h-28" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {categories.map((c, i) => (
              <CategoryTile
                key={c.id}
                category={c}
                index={i}
                onClick={() => navigate(`/directory?category=${c.id}`)}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Top verified pros ────────────────────────────────────── */}
      <section className="pt-7" aria-labelledby="pros-heading">
        <div className="mb-3 flex items-baseline justify-between px-5">
          <h2 id="pros-heading" className="text-[17px] font-extrabold tracking-tight text-ink">
            Top verified local pros
          </h2>
          <button
            type="button"
            onClick={() => navigate('/directory')}
            className="text-[13px] font-bold text-royal"
          >
            See all
          </button>
        </div>

        {loading ? (
          <div className="flex gap-3 px-5">
            <SkeletonCard className="h-40 w-44 shrink-0" />
            <SkeletonCard className="h-40 w-44 shrink-0" />
          </div>
        ) : pros.length === 0 ? (
          <p className="px-5 text-[13px] text-ink-soft">
            No verified karigars listed yet. Check the full directory.
          </p>
        ) : (
          <ul className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2">
            {pros.map((p, i) => (
              <li key={p.id} className="snap-start">
                <ProCard
                  pro={p}
                  index={i}
                  onContact={() => navigate(`/directory?q=${encodeURIComponent(p.shop_name || p.full_name)}`)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="px-5 pb-4 pt-6 text-center text-[12px] leading-relaxed text-ink-muted">
        Karigar D.I. Khan — har mohalle ka bharosay wala karigar.
      </p>
    </div>
  )
}

/**
 * Carousel card. No `tel:` link — the number is not in the page at all.
 * Tapping through to the directory is where the paid reveal happens, so the
 * home screen cannot become a way around it.
 */
function ProCard({ pro, index, onContact }) {
  return (
    <article
      className="card animate-rise flex h-full w-44 flex-col p-3"
      style={{ animationDelay: `${Math.min(index, 6) * 40}ms` }}
    >
      <div className="flex items-center gap-2">
        {pro.avatar_url ? (
          <img src={pro.avatar_url} alt="" className="h-10 w-10 rounded-xl object-cover" loading="lazy" />
        ) : (
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-royal-wash text-[13px] font-bold text-royal">
            {initials(pro.full_name)}
          </span>
        )}
        <span className="tnum ml-auto flex items-center gap-0.5 text-[12px] font-bold text-ink">
          <Star className="w-3 h-3 fill-amber text-amber" aria-hidden="true" />
          {pro.rating.toFixed(1)}
        </span>
      </div>

      <h3 className="mt-2 line-clamp-2 text-[13.5px] font-bold leading-tight text-ink">
        {pro.shop_name || pro.full_name}
      </h3>

      <p className="mt-1 flex items-center gap-1 text-[11.5px] text-ink-muted">
        <CategoryIcon name={pro.icon_name} className="w-3.5 h-3.5" strokeWidth={2} />
        {pro.category_name}
      </p>
      <p className="mt-0.5 flex items-center gap-1 text-[11.5px] text-ink-muted">
        <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
        {pro.address_area}
      </p>

      <div className="mt-2">{pro.is_verified && <VerifiedBadge />}</div>

      <Button variant="action" size="sm" className="mt-2.5 w-full" onClick={onContact}>
        Contact
      </Button>
    </article>
  )
}
