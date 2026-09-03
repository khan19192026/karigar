import { useCallback, useEffect, useMemo, useState } from 'react'
import { MapPin, Wallet } from 'lucide-react'
import CategoryIcon from '../CategoryIcon'
import { VoiceNotePlayer } from '../VoiceRecorder'
import { SearchBar } from './AdminKarigars'
import { Chip, Loading, Pill, Select, useToast } from '../ui'
import { admin } from '../../lib/db'
import { pkr, prettyPhone, timeAgo } from '../../lib/format'

const STATUS_TONE = {
  open: 'amber',
  assigned: 'royal',
  completed: 'success',
  cancelled: 'neutral',
}

const FILTERS = ['all', 'open', 'assigned', 'completed', 'cancelled']

/**
 * Every job in every status. The admin sees the customer's number here
 * without paying — that is the point of the role, and it is why the panel is
 * gated by is_admin() at the database level rather than in the router.
 */
export default function AdminJobs() {
  const toast = useToast()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await admin.listJobs())
    } catch {
      toast('Could not load jobs', 'alert')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows
      .filter((r) => (status === 'all' ? true : r.status === status))
      .filter((r) =>
        !q
          ? true
          : [r.title, r.description, r.area_location, r.customer_name, r.customer_phone]
              .filter(Boolean)
              .some((f) => String(f).toLowerCase().includes(q)),
      )
  }, [rows, query, status])

  async function changeStatus(job, next) {
    try {
      await admin.setJobStatus(job.id, next)
      toast(`Job marked ${next}`, 'success')
      load()
    } catch {
      toast('Could not change the status', 'alert')
    }
  }

  if (loading) return <Loading label="Loading jobs" />

  return (
    <div className="space-y-3">
      <SearchBar value={query} onChange={setQuery} placeholder="Job, area, customer or number" />

      <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5">
        {FILTERS.map((f) => (
          <Pill key={f} active={status === f} onClick={() => setStatus(f)}>
            <span className="capitalize">{f === 'all' ? 'All jobs' : f}</span>
          </Pill>
        ))}
      </div>

      <p className="tnum px-1 text-[12px] font-semibold text-ink-soft">
        {visible.length} {visible.length === 1 ? 'job' : 'jobs'}
      </p>

      {visible.length === 0 ? (
        <p className="card p-4 text-center text-[13px] text-ink-soft">No job matches these filters.</p>
      ) : (
        visible.map((job) => (
          <article key={job.id} className="card p-3.5">
            <div className="flex items-start gap-2.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-royal-wash text-royal">
                <CategoryIcon name={job.icon_name} className="w-[18px] h-[18px]" />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-[14px] font-bold leading-snug text-ink">{job.title}</h3>
                <p className="text-[11.5px] text-ink-muted">
                  {job.category_name} · {timeAgo(job.created_at)}
                </p>
              </div>
              <Chip tone={STATUS_TONE[job.status]}>{job.status}</Chip>
            </div>

            {job.description && (
              <p className="mt-2 text-[12.5px] leading-relaxed text-ink-soft">{job.description}</p>
            )}

            {job.audio_note_url && (
              <div className="mt-2">
                <VoiceNotePlayer url={job.audio_note_url} />
              </div>
            )}

            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <Chip>
                <MapPin className="w-3 h-3" aria-hidden="true" />
                {job.area_location}
              </Chip>
              {job.proposed_budget != null && (
                <Chip tone="amber">
                  <Wallet className="w-3 h-3" aria-hidden="true" />
                  <span className="tnum">{pkr(job.proposed_budget)}</span>
                </Chip>
              )}
              {job.customer_banned && <Chip tone="alert">Customer banned</Chip>}
            </div>

            <div className="mt-3 flex items-end justify-between gap-3 border-t border-line pt-3">
              <div className="min-w-0">
                <p className="eyebrow text-ink-muted">Posted by</p>
                <p className="truncate text-[13px] font-bold text-ink">{job.customer_name || 'Unknown'}</p>
                {job.customer_phone && (
                  <p className="tnum text-[12.5px] text-ink-soft">{prettyPhone(job.customer_phone)}</p>
                )}
              </div>
              <div className="w-36 shrink-0">
                <Select
                  value={job.status}
                  onChange={(e) => changeStatus(job, e.target.value)}
                  aria-label={`Change status of ${job.title}`}
                  className="!py-2 !text-[13px]"
                >
                  <option value="open">Open</option>
                  <option value="assigned">Assigned</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </Select>
              </div>
            </div>
          </article>
        ))
      )}
    </div>
  )
}
