import { ShieldAlert } from 'lucide-react'
import { Button } from '../components/ui'
import { useSession } from '../store/session'
import { whatsappHref } from '../lib/format'

/**
 * What a banned account sees instead of the app.
 *
 * It states the reason and gives one way forward. A blocked user with no
 * route to appeal just reinstalls under a new number, so the support link is
 * the useful part, not a courtesy.
 */
export default function Banned() {
  const { profile, supportWhatsapp, signOut } = useSession()

  const appeal = whatsappHref(
    supportWhatsapp,
    `Assalam o Alaikum. Mera account (${profile?.phone_number || ''}) band kar diya gaya hai. Main iss par baat karna chahta hoon.`,
  )

  return (
    <div className="flex min-h-dvh flex-col justify-center px-6 py-12">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-alert-wash text-alert">
        <ShieldAlert className="w-7 h-7" strokeWidth={2} aria-hidden="true" />
      </span>

      <h1 className="mt-4 text-[24px] font-extrabold leading-tight tracking-tight text-ink">
        Aap ka account band hai
      </h1>
      <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">
        This account has been blocked, so it cannot post jobs, appear in the directory, or unlock
        customer contacts.
      </p>

      {profile?.banned_reason && (
        <div className="card mt-4 p-3.5">
          <p className="eyebrow text-ink-muted">Reason given</p>
          <p className="mt-1 text-[13.5px] font-semibold leading-relaxed text-ink">
            {profile.banned_reason}
          </p>
        </div>
      )}

      <p className="mt-4 text-[13px] leading-relaxed text-ink-soft">
        If you think this is a mistake, message our team — they can review it and lift the block.
      </p>

      <div className="mt-6 space-y-2">
        <Button as="a" href={appeal} target="_blank" rel="noopener noreferrer" variant="success" size="lg" full>
          Message support on WhatsApp
        </Button>
        <Button variant="outline" size="lg" full onClick={signOut}>
          Sign out
        </Button>
      </div>
    </div>
  )
}
