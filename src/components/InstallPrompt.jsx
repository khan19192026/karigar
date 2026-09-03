import { useCallback, useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'
import {
  clearInstallPrompt,
  getInstallPrompt,
  isInstalled,
  onInstallPromptChange,
} from '../lib/installPrompt'

const DISMISS_KEY = 'karigar.install.dismissed'

/**
 * Install banner for Android Chrome.
 *
 * Chrome's own automatic banner (the "mini-infobar") is deprecated and its
 * appearance depends on browser version and the user's engagement history,
 * so it cannot be relied on. The dependable path is to catch
 * `beforeinstallprompt` and drive the real install dialog from a button of
 * our own — the catching happens in lib/installPrompt.js, at module scope,
 * because the event fires long before this component mounts.
 *
 * iOS is not handled: Safari never fires this event, so no prompt of any kind
 * is possible there and an iPhone user must use Share → Add to Home Screen.
 * That is a deliberate gap — Android is the target for this pilot.
 */
export default function InstallPrompt() {
  const [promptEvent, setPromptEvent] = useState(() => getInstallPrompt())
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(DISMISS_KEY) === '1',
  )

  useEffect(() => onInstallPromptChange(setPromptEvent), [])

  const install = useCallback(async () => {
    if (!promptEvent) return
    promptEvent.prompt()
    const { outcome } = await promptEvent.userChoice
    // Single-use event. Chrome fires a fresh one if the app is still eligible.
    clearInstallPrompt()
    if (outcome === 'dismissed') {
      localStorage.setItem(DISMISS_KEY, '1')
      setDismissed(true)
    }
  }, [promptEvent])

  const dismiss = useCallback(() => {
    localStorage.setItem(DISMISS_KEY, '1')
    setDismissed(true)
  }, [])

  if (dismissed || !promptEvent || isInstalled()) return null

  return (
    <div
      className="shell fixed inset-x-0 z-40 px-4"
      style={{ bottom: 'calc(var(--nav-height) + env(safe-area-inset-bottom) + 12px)' }}
    >
      <div className="animate-rise flex items-center gap-3 rounded-[var(--radius-card)] bg-royal p-3.5 text-white shadow-lg">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber text-ink">
          <Download className="w-5 h-5" strokeWidth={2.4} aria-hidden="true" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-bold leading-tight">App phone mein install karein</p>
          <p className="mt-0.5 text-[12px] leading-snug text-white/80">
            Phir har baar Chrome kholne ki zaroorat nahi — icon se seedha khulega.
          </p>
        </div>

        <button
          type="button"
          onClick={install}
          className="tap shrink-0 rounded-xl bg-amber px-3.5 py-2.5 text-[13px] font-bold text-ink press"
        >
          Install karein
        </button>

        <button
          type="button"
          onClick={dismiss}
          aria-label="Band karein"
          className="-mr-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-white/60 hover:text-white"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
