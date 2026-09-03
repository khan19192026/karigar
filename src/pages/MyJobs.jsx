import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClipboardList, MapPin, Wallet } from 'lucide-react'
import CategoryIcon from '../components/CategoryIcon'
import { VoiceNotePlayer } from '../components/VoiceRecorder'
import { Button, Chip, EmptyState, Loading, useToast } from '../components/ui'
import ConfirmJobSheet from '../components/ConfirmJobSheet'
import { listJobsAwaitingMe, listMyRequests, updateRequestStatus } from '../lib/db'
import { pkr, timeAgo } from '../lib/format'

const STATUS = {
  open: { label: 'Karigars ka intezar', tone: 'amber' },
  assigned: { label: 'Karigar aa raha hai', tone: 'royal' },
  awaiting_confirmation: { label: 'Aap ki tasdeeq chahiye', tone: 'alert' },
  completed: { label: 'Mukammal', tone: 'success' },
  cancelled: { label: 'Cancel', tone: 'neutral' },
}

/** Customer view of the fourth tab: everything they have asked for. */
export default function MyJobs() {
  const navigate = useNavigate()
  const toast = useToast()
  const [jobs, setJobs] = useState([])
  const [awaiting, setAwaiting] = useState([])
  const [confirming, setConfirming] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [mine, awaiting] = await Promise.all([listMyRequests(), listJobsAwaitingMe()])
      setJobs(mine)
      setAwaiting(awaiting)
      // Ask about the oldest unconfirmed job the moment they open the tab —
      // this answer is what closes the karigar's job and feeds the audit.
      setConfirming((current) => current || awaiting[0] || null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function setStatus(id, status) {
    await updateRequestStatus(id, status)
    toast(status === 'completed' ? 'Marked as completed' : 'Job cancelled', 'success')
    load()
  }

  if (loading) return <Loading label="Loading your jobs" />

  return (
    <div className="px-5 pt-4">
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="text-[20px] font-extrabold tracking-tight text-ink">My jobs</h1>
        {jobs.length > 0 && (
          <span className="tnum text-[12.5px] font-semibold text-ink-soft">{jobs.length} posted</span>
        )}
      </div>

      {/* A karigar cannot take their next job until this is answered, so it
          sits above the history rather than inside it. */}
      {awaiting.length > 0 && (
        <ul className="mb-4 space-y-2">
          {awaiting.map((job) => (
            <li
              key={job.id}
              className="rounded-[var(--radius-card)] border border-alert/30 bg-alert-wash p-3.5"
            >
              <p className="text-[13.5px] font-bold text-ink">
                Kya {job.technician_name || 'karigar'} ne kaam mukammal kiya?
              </p>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-soft">{job.title}</p>
              <Button
                variant="alert"
                size="sm"
                full
                className="mt-2.5"
                onClick={() => setConfirming(job)}
              >
                Jawab dein
              </Button>
            </li>
          ))}
        </ul>
      )}

      {jobs.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No jobs posted yet"
          body="Post a job and verified karigars in your area will call you back — usually within the hour."
          action={
            <Button variant="action" full onClick={() => navigate('/post-job')}>
              Post a job
            </Button>
          }
        />
      ) : (
        <ul className="space-y-3">
          {jobs.map((job, i) => {
            const status = STATUS[job.status] || STATUS.open
            return (
              <li
                key={job.id}
                className="card animate-rise p-4"
                style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}
              >
                <div className="flex items-start gap-2">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-royal-wash text-royal">
                    <CategoryIcon name={job.icon_name} className="w-[18px] h-[18px]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-[14.5px] font-bold leading-snug text-ink">{job.title}</h2>
                    <p className="mt-0.5 text-[11.5px] text-ink-muted">
                      {job.category_name} · {timeAgo(job.created_at)}
                    </p>
                  </div>
                  <Chip tone={status.tone}>{status.label}</Chip>
                </div>

                {job.description && (
                  <p className="mt-2.5 text-[13px] leading-relaxed text-ink-soft">{job.description}</p>
                )}

                {job.audio_note_url && (
                  <div className="mt-2.5">
                    <VoiceNotePlayer url={job.audio_note_url} label="Your voice note" />
                  </div>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
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

                  {/* "Mark done" is gone on purpose: a job with no karigar
                      attached cannot be completed, and completing one that
                      has a karigar must go through the confirmation so the
                      audit and the rating actually happen. */}
                  {job.status === 'open' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto"
                      onClick={() => setStatus(job.id, 'cancelled')}
                    >
                      Cancel karein
                    </Button>
                  )}

                  {job.status === 'completed' && job.customer_amount != null && (
                    <span className="tnum ml-auto text-[12px] font-semibold text-ink-soft">
                      Diye: {pkr(job.customer_amount)}
                    </span>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <ConfirmJobSheet
        job={confirming}
        onClose={() => setConfirming(null)}
        onDone={load}
      />
    </div>
  )
}
