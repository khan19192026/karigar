import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { BadgeCheck, Loader2, X } from 'lucide-react'

/* ═══════════════════════════════════════════════════════════════ Button ══ */

const VARIANTS = {
  primary: 'bg-royal text-white hover:bg-royal-deep active:bg-royal-deep',
  action: 'bg-amber text-ink hover:brightness-95 active:brightness-90',
  alert: 'bg-alert text-white hover:brightness-95',
  success: 'bg-success text-white hover:brightness-95',
  outline: 'bg-card text-ink border border-line hover:bg-canvas',
  ghost: 'bg-transparent text-royal hover:bg-royal-wash',
}

export function Button({
  as: Tag = 'button',
  variant = 'primary',
  size = 'md',
  loading = false,
  full = false,
  className = '',
  children,
  disabled,
  ...rest
}) {
  const sizes = {
    sm: 'text-sm px-3 py-2 rounded-xl gap-1.5',
    md: 'text-[15px] px-4 py-3 rounded-2xl gap-2 tap',
    lg: 'text-base px-5 py-4 rounded-2xl gap-2 tap',
  }
  return (
    <Tag
      className={`inline-flex items-center justify-center font-semibold press
        disabled:opacity-45 disabled:pointer-events-none
        ${VARIANTS[variant]} ${sizes[size]} ${full ? 'w-full' : ''} ${className}`}
      disabled={Tag === 'button' ? disabled || loading : undefined}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
      {children}
    </Tag>
  )
}

/* ═══════════════════════════════════════════════════════ Form controls ══ */

export function Field({ label, hint, error, children, required }) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between mb-1.5">
        <span className="text-[13px] font-semibold text-ink-soft">
          {label}
          {required && <span className="text-alert"> *</span>}
        </span>
        {hint && <span className="text-[11px] text-ink-muted">{hint}</span>}
      </span>
      {children}
      {error && (
        <span className="mt-1.5 block text-[12px] font-medium text-alert" role="alert">
          {error}
        </span>
      )}
    </label>
  )
}

const CONTROL =
  'w-full rounded-2xl border border-line bg-card px-4 py-3 text-[15px] text-ink tap ' +
  'focus:border-royal focus:outline-none focus:ring-2 focus:ring-royal/20 transition'

export function Input({ className = '', ...rest }) {
  return <input className={`${CONTROL} ${className}`} {...rest} />
}

export function Textarea({ className = '', rows = 4, ...rest }) {
  return <textarea rows={rows} className={`${CONTROL} resize-none leading-relaxed ${className}`} {...rest} />
}

export function Select({ className = '', children, ...rest }) {
  return (
    <div className="relative">
      <select className={`${CONTROL} appearance-none pr-10 ${className}`} {...rest}>
        {children}
      </select>
      <svg
        className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted"
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden="true"
      >
        <path d="M6 8l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

/* ═════════════════════════════════════════════════════════════ Badges ══ */

/**
 * The CNIC-verified badge — the thing the whole product is selling.
 *
 * The truck-art ribbon was tried here and cut: at 10px the chevrons read as
 * a rendering artefact striking through the text rather than as a motif.
 * It now appears once, on the emergency banner, where it has room to be
 * legible.
 */
export function VerifiedBadge({ size = 'sm' }) {
  const big = size === 'lg'
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-royal font-bold text-white
        ${big ? 'px-2.5 py-1 text-[11px]' : 'px-2 py-0.5 text-[10px]'}`}
    >
      <BadgeCheck className={big ? 'w-3.5 h-3.5' : 'w-3 h-3'} strokeWidth={2.5} aria-hidden="true" />
      CNIC Verified
    </span>
  )
}

export function Pill({ active, children, className = '', ...rest }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={`shrink-0 rounded-full border px-3.5 py-2 text-[13px] font-semibold whitespace-nowrap press transition
        ${active ? 'border-royal bg-royal text-white' : 'border-line bg-card text-ink-soft hover:border-royal/40'}
        ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

export function Chip({ tone = 'neutral', children, className = '' }) {
  const tones = {
    neutral: 'bg-canvas text-ink-soft border-line',
    royal: 'bg-royal-wash text-royal border-royal/15',
    amber: 'bg-amber-wash text-amber-deep border-amber/25',
    success: 'bg-success-wash text-success border-success/20',
    alert: 'bg-alert-wash text-alert border-alert/20',
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  )
}

/* ══════════════════════════════════════════════════════════════ Sheet ══ */

/** Bottom sheet — the modal shape that belongs on a phone. Closes on
 *  backdrop tap and Escape, and restores focus to the trigger. */
export function Sheet({ open, onClose, title, subtitle, children }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-ink/45 animate-fade" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="shell relative w-full max-h-[88vh] overflow-y-auto rounded-t-3xl bg-card animate-sheet-up
          pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
      >
        <div className="sticky top-0 z-10 flex items-start gap-3 border-b border-line bg-card px-5 pb-3 pt-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-[17px] font-bold leading-tight text-ink">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[13px] text-ink-soft">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="tap -mr-2 -mt-2 grid place-items-center rounded-full text-ink-muted hover:bg-canvas"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-5 pt-4">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

/* ══════════════════════════════════════════════════════════════ Toast ══ */

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null)

  const show = useCallback((message, tone = 'royal') => {
    setToast({ message, tone, id: Math.random() })
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3200)
    return () => clearTimeout(t)
  }, [toast])

  const value = useMemo(() => ({ show }), [show])

  const tones = {
    royal: 'bg-royal text-white',
    success: 'bg-success text-white',
    alert: 'bg-alert text-white',
  }

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast &&
        createPortal(
          <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center px-4">
            <div
              role="status"
              className={`shell w-full rounded-2xl px-4 py-3 text-[14px] font-semibold shadow-lg animate-rise ${tones[toast.tone]}`}
            >
              {toast.message}
            </div>
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx.show
}

/* ═══════════════════════════════════════════════════ States & skeletons ══ */

export function Spinner({ className = 'w-5 h-5' }) {
  return <Loader2 className={`${className} animate-spin text-royal`} aria-hidden="true" />
}

export function Loading({ label = 'Loading' }) {
  return (
    <div className="flex items-center justify-center gap-2 py-14 text-ink-muted" role="status">
      <Spinner />
      <span className="text-sm font-medium">{label}</span>
    </div>
  )
}

/** Empty screens are an invitation to act, so this always takes an action. */
export function EmptyState({ icon: Icon, title, body, action }) {
  return (
    <div className="card mx-auto flex max-w-sm flex-col items-center px-6 py-10 text-center">
      {Icon && (
        <span className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-royal-wash text-royal">
          <Icon className="w-6 h-6" strokeWidth={1.75} aria-hidden="true" />
        </span>
      )}
      <h3 className="text-[15px] font-bold text-ink">{title}</h3>
      {body && <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">{body}</p>}
      {action && <div className="mt-4 w-full">{action}</div>}
    </div>
  )
}

export function SkeletonCard({ className = 'h-24' }) {
  return <div className={`card animate-pulse bg-line/40 ${className}`} aria-hidden="true" />
}
