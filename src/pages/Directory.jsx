import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Search, SlidersHorizontal, Timer, UserSearch, X } from 'lucide-react'
import TechnicianCard from '../components/TechnicianCard'
import CategoryIcon from '../components/CategoryIcon'
import ContactUnlockSheet from '../components/ContactUnlockSheet'
import { Button, EmptyState, Loading, Pill } from '../components/ui'
import { listCategories, listRevealedContacts, listTechnicians } from '../lib/db'
import { AREAS } from '../lib/constants'
import { useSession } from '../store/session'

/**
 * The directory. Filters live in the URL so a filtered view can be shared,
 * and so the back button behaves the way a phone user expects.
 */
export default function Directory() {
  const navigate = useNavigate()
  const { profile } = useSession()
  const [params, setParams] = useSearchParams()
  const [categories, setCategories] = useState([])
  const [techs, setTechs] = useState([])
  const [loading, setLoading] = useState(true)
  const [contactTarget, setContactTarget] = useState(null)
  const [revealed, setRevealed] = useState({})

  const area = params.get('area') || ''
  const categoryId = params.get('category') || ''
  const query = params.get('q') || ''
  const emergency = params.get('emergency') === '1'

  const [searchDraft, setSearchDraft] = useState(query)
  useEffect(() => setSearchDraft(query), [query])

  useEffect(() => {
    listCategories().then(setCategories).catch(() => setCategories([]))
  }, [])

  // Contacts already paid for, so a returning customer is not charged twice
  // and the card says "Number dekhein" instead of offering to unlock again.
  useEffect(() => {
    if (!profile) return
    listRevealedContacts().then(setRevealed).catch(() => setRevealed({}))
  }, [profile])

  /** An account is needed before a karigar can be billed for the reveal. */
  function handleContact(tech) {
    if (!profile) {
      navigate('/onboarding')
      return
    }
    setContactTarget(tech)
  }

  useEffect(() => {
    let alive = true
    setLoading(true)
    listTechnicians({ area: area || undefined, categoryId: categoryId || undefined, query: query || undefined })
      .then((rows) => alive && setTechs(rows))
      .catch(() => alive && setTechs([]))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [area, categoryId, query])

  /** Emergency view narrows to verified pros who are free today — the only
   *  people who can honestly answer a 20-minute promise. */
  const visible = useMemo(
    () => (emergency ? techs.filter((t) => t.is_verified && t.is_available) : techs),
    [techs, emergency],
  )

  function update(key, value) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  function clearAll() {
    setParams(new URLSearchParams(), { replace: true })
  }

  const activeCategory = categories.find((c) => c.id === categoryId)
  const filterCount = [area, categoryId, query, emergency ? '1' : ''].filter(Boolean).length

  return (
    <div>
      <header>
        {/* Title and search scroll away; only the filter pills stay pinned.
            Two sticky rows is all a 932px screen can spare. */}
        <div className="px-5 pb-3 pt-4">
          <div className="flex items-baseline justify-between">
            <h1 className="text-[20px] font-extrabold tracking-tight text-ink">Karigar directory</h1>
            {!loading && (
              <span className="tnum text-[12.5px] font-semibold text-ink-soft">
                {visible.length} {visible.length === 1 ? 'karigar' : 'karigars'}
              </span>
            )}
          </div>

          <form
            role="search"
            onSubmit={(e) => {
              e.preventDefault()
              update('q', searchDraft.trim())
            }}
            className="relative mt-3"
          >
            <Search
              className="pointer-events-none absolute left-4 top-1/2 w-[18px] h-[18px] -translate-y-1/2 text-ink-muted"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              placeholder="Name, shop or area"
              aria-label="Search the directory"
              enterKeyHint="search"
              className="tap w-full rounded-2xl border border-line bg-card py-3 pl-11 pr-4 text-[15px]
                focus:border-royal focus:outline-none focus:ring-2 focus:ring-royal/20"
            />
          </form>
        </div>

        <div className="sticky top-0 z-30 border-b border-line bg-canvas pt-1">
          {/* Category pills */}
          <div className="no-scrollbar flex gap-2 overflow-x-auto px-5 pb-2.5">
            <Pill active={!categoryId} onClick={() => update('category', '')}>
              All work
            </Pill>
            {categories.map((c) => (
              <Pill key={c.id} active={categoryId === c.id} onClick={() => update('category', c.id)}>
                <span className="flex items-center gap-1.5">
                  <CategoryIcon name={c.icon_name} className="w-3.5 h-3.5" strokeWidth={2.2} />
                  {c.name_en}
                </span>
              </Pill>
            ))}
          </div>

          {/* Area pills */}
          <div className="no-scrollbar flex gap-2 overflow-x-auto px-5 pb-2.5">
            <Pill active={!area} onClick={() => update('area', '')}>
              All areas
            </Pill>
            {AREAS.map((a) => (
              <Pill key={a} active={area === a} onClick={() => update('area', a)}>
                {a}
              </Pill>
            ))}
          </div>
        </div>
      </header>

      <div className="space-y-3 px-5 pt-4">
        {emergency && (
          <div className="flex items-start gap-2.5 rounded-2xl border border-alert/20 bg-alert-wash p-3.5">
            <Timer className="mt-0.5 w-5 h-5 shrink-0 text-alert" strokeWidth={2.2} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-bold text-ink">Emergency response</p>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-soft">
                Showing verified karigars who are free today. Call directly — they aim to reach you
                within 20 minutes.
              </p>
            </div>
            <button
              type="button"
              onClick={() => update('emergency', '')}
              aria-label="Turn off the emergency filter"
              className="tap -mr-1 -mt-1 grid shrink-0 place-items-center rounded-full text-ink-muted"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {filterCount > 0 && !emergency && (
          <div className="flex items-center gap-2 text-[12.5px] text-ink-soft">
            <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="truncate">
              {[activeCategory?.name_en, area, query && `“${query}”`].filter(Boolean).join(' · ')}
            </span>
            <button type="button" onClick={clearAll} className="ml-auto shrink-0 font-bold text-royal">
              Clear
            </button>
          </div>
        )}

        {loading ? (
          <Loading label="Finding karigars" />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={UserSearch}
            title="No karigar matches these filters"
            body={
              emergency
                ? 'Nobody verified is free right now. Try the full directory, or post the job so karigars call you back.'
                : 'Try a different area or trade — or clear the filters to see everyone in D.I. Khan.'
            }
            action={
              <Button variant="outline" full onClick={clearAll}>
                Clear filters
              </Button>
            }
          />
        ) : (
          visible.map((t, i) => (
            <TechnicianCard
              key={t.id}
              tech={t}
              index={i}
              revealed={Boolean(revealed[t.id])}
              onContact={handleContact}
            />
          ))
        )}
      </div>

      <ContactUnlockSheet
        tech={contactTarget}
        known={contactTarget ? revealed[contactTarget.id] : null}
        onClose={() => setContactTarget(null)}
        onRevealed={(id, result) => setRevealed((r) => ({ ...r, [id]: result }))}
      />
    </div>
  )
}
