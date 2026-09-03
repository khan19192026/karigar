# Karigar D.I. Khan

A mobile-first PWA for hyperlocal on-demand home services in Dera Ismail Khan.
Customers find a CNIC-verified karigar in their own area and call them directly;
karigars list their shop and buy job leads from a wallet.

```bash
npm install
npm run dev      # http://localhost:5173
```

It runs with **no configuration**. With no Supabase credentials the app uses a
built-in demo backend (localStorage, seeded with twelve D.I. Khan technicians
and six open jobs), so you can walk the whole product before provisioning
anything. A dark ribbon at the top of the screen says so.

## Connecting Supabase

1. Create a project, then run `supabase/schema.sql` in the SQL editor. It is
   idempotent — safe to re-run.
2. Copy `.env.example` to `.env.local` and fill in `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY`.
3. Restart the dev server. The demo ribbon disappears.

To reach `/admin-config` with write access, sign in once, then:

```sql
UPDATE profiles SET user_role = 'admin' WHERE phone_number = '923001234567';
```

In demo mode there is no SQL console, so **Me → Admin panel** is open, and
**Me → Make this account an admin** promotes the current account.

### Authentication

`VITE_AUTH_MODE` selects how someone signs in:

| Mode | Behaviour |
| --- | --- |
| `local` (default) | The phone number is trusted as entered. Fine for a pilot demo; **not** for production. |
| `otp` | Supabase phone OTP. Requires an SMS provider (Twilio, Vonage, MessageBird) configured under **Authentication → Providers → Phone**. |

Phone OTP is the intended production path — the schema's `profiles.id`
references `auth.users`, and the RLS policies are written for real
authenticated identities.

## How the money works

Lead unlocking is the business model, so none of it happens in the browser.

- `unlock_lead(request_id)` is a `SECURITY DEFINER` function that runs the
  whole purchase in one transaction: it locks the technician row, checks
  `app_config`, spends a free lead if one remains, otherwise debits the
  wallet, writes the ledger entry, and only then returns the customer's
  contact details. It raises `INSUFFICIENT_BALANCE`, which the client turns
  into the top-up sheet.
- `technician_profiles.wallet_balance` is not writable from the client. The
  `tech_self_update` policy lets a karigar edit their listing while pinning
  `wallet_balance`, `is_verified` and `rating` to their current values.
- Top-ups are manual today: the karigar sends JazzCash/EasyPaisa and shares
  the receipt on WhatsApp. `creditWalletDemo()` exists only on the demo
  backend and throws against Supabase — wiring a payment webhook is the
  obvious next step.
- `lead_unlocks` has a `UNIQUE (technician_id, request_id)` constraint, so a
  double tap on a bad connection cannot charge twice.

Flip charging on or off at `/admin-config` — `monetization_active` is read on
every unlock, so the launch offer can end without a deploy.

## The admin panel

`/admin-config` has five tabs:

| Tab | What it does |
| --- | --- |
| **Overview** | Lead revenue, unspent wallet float, and counts of customers, karigars, verified karigars, open jobs, leads sold and banned accounts. |
| **Karigars** | Every listing including banned ones. Grant or remove the CNIC-verified badge, credit or deduct a wallet, ban or restore. |
| **Users** | Customer and admin accounts with job counts. Ban or restore. |
| **Jobs** | Every job in every status, with the poster's name and number, the voice note, and a status dropdown. |
| **Settings** | The `app_config` values — charging on/off, cost per lead, free allowance, support number. |

**Wallet credits happen here.** A receipt arrives on WhatsApp, you credit the
karigar's wallet against its TID, and `admin_credit_wallet()` writes a ledger
entry so the change is auditable. Negative amounts are corrections. This is
the only way to top up a wallet against Supabase — there is deliberately no
client path.

### What a ban does

A ban is reversible and always records a reason, because "someone banned
them" is not an answer for the next admin. Banning:

- signs the account out and shows it a dead-end screen with the reason and a
  WhatsApp appeal link;
- removes a karigar from the directory (`tech_public_read`);
- cancels the customer's open jobs, so no karigar pays for a lead that is
  about to go nowhere;
- blocks posting jobs (`requests_customer_insert`) and unlocking leads
  (`unlock_lead` raises `ACCOUNT_BANNED`);
- **keeps the wallet balance**, so restoring an account restores its money.

Two guards worth knowing: `admin_set_ban()` refuses to ban the caller's own
account, and `is_admin()` returns false for a banned admin — otherwise a ban
could lock everyone out of the panel that undoes it.

Every admin write goes through an RPC that re-checks `is_admin()` inside the
function body. The route guard in the UI is convenience; the database is the
boundary.

## Installing on a phone

The manifest and service worker meet Chrome's installability criteria, so the
app installs to the home screen and opens without any browser UI
(`display: standalone`). Two requirements: serve it over **HTTPS**, and
deploy at the **domain root** — `start_url` and `scope` are both `/`, so a
subpath deploy needs Vite's `base` and the manifest paths changed to match.

**Android.** Chrome's own automatic banner (the "mini-infobar") is deprecated
and shows inconsistently, so the app does not depend on it. Instead
`src/lib/installPrompt.js` catches `beforeinstallprompt` **at module scope**,
before React renders, and `InstallPrompt.jsx` drives the real install dialog
from its own button. The module-scope part is not incidental: Chrome fires
that event about a second after load, while a first-time visitor is still on
`/onboarding`, so a listener inside the main-tab component would miss it
every time and the banner would never appear.

Dismissal is remembered in localStorage, and the `appinstalled` event clears
it so an uninstall-reinstall cycle gets offered again.

**iOS is not handled.** Safari never fires `beforeinstallprompt`, so no
prompt of any kind is possible; an iPhone user has to use Share → Add to Home
Screen manually. This is a deliberate gap for the D.I. Khan pilot, where
Android dominates — not an oversight.

## Keeping phone numbers behind the paywall

A karigar pays to see a customer's number, but a job description is visible
to every karigar *before* they pay. So a customer typing "0300 1234567 par
call karein" into the description gives the number away for free and the lead
never sells.

`maskPhoneNumbers()` in `src/lib/format.js` strips them, applied at write
time in `createRequest()` so neither backend can skip it. It matches on the
*shape* of a Pakistani number rather than on digit count, so a budget or a
price range survives untouched, and it normalises Urdu and Arabic-Indic
digits first. The form warns as the customer types instead of silently
editing their words after they post.

```bash
npm run test:mask   # 17 cases: real numbers masked, prices left alone
```

The voice note is the remaining hole — a customer can still read their number
aloud, and the clip plays before unlock because a karigar needs it to judge
the job. The recorder carries a warning; putting the clip behind the paywall
is the stronger fix if leakage shows up in practice.

## In-app chat, media and the offer engine

Chat is the **secondary** channel, deliberately. A phone call connects in ten
seconds and a PWA cannot ring reliably when the app is closed, so **Call is
the primary CTA** and chat earns its place by carrying what a call cannot: a
photo of the broken appliance, and a written price on the record.

Opening a chat from the directory goes through the **same paid reveal** as
tapping Call. Free chat would have made the contact fee optional and the
directory revenue would have evaporated. A karigar chatting on a lead they
already unlocked pays nothing more.

**Phone numbers are masked in chat text** (`maskPhoneNumbers`, shared with
job posting). Without that, removing the dialer buttons would achieve
nothing — chat would simply become the new leak channel.

### Media pipeline

All compression is client-side, before anything touches the network.

| Kind | Handling | Target |
| --- | --- | --- |
| Image | Canvas resize to 1600px max edge, then JPEG quality stepped down until it fits | ~400 KB |
| Video | Played into a canvas and re-recorded via `MediaRecorder`, 720p (480p over 20s) | ~8 MB, 45s cap |
| Voice | `MediaRecorder` Opus/WebM at 24 kbps | tiny, 120s cap |

Two honest limits on video, both surfaced in the UI rather than hidden:

- **It runs in real time.** A 30-second clip takes about 30 seconds, which is
  why the composer shows a percentage.
- **Output is WebM, not MP4.** Every Android browser plays it. Where
  transcoding is unavailable, a file already under the cap passes through
  unchanged and anything larger is refused with a clear message.

This uses no dependency. `ffmpeg.wasm` would be the obvious alternative and
is the wrong one here: a ~25 MB download to save a few MB of upload, on the
exact devices and connections this pilot targets.

Demo-mode media lives in **IndexedDB**, not localStorage — a single 8 MB
video becomes ~11 MB as base64 and would blow the 5 MB quota on its own.

### Offer engine

Either side sends a price. Sending a new offer **supersedes** any pending
one, so only the latest is actionable and no stale price lingers. Only the
*other* party can accept — you cannot agree with yourself.

On accept, the amount is written to `service_requests.agreed_amount` and the
job moves to `assigned` (the schema's name for In-Progress). If the thread had
no job attached — a directory enquiry — **one is created**, so every accepted
offer lands in the same completion, rating and cross-audit flow as a posted
job. The unconfirmed-job cap and the strike freeze are both enforced at accept
time, since accepting puts work in the karigar's hands.

### Realtime and notifications

Supabase Realtime pushes message changes over a WebSocket; the demo backend
fires an event on write, so two windows side by side behave like a real chat.

Notifications work in two tiers:

- **Tab open** — works with no infrastructure. Suppressed while the tab is
  visible, since the message is already on screen.
- **App closed** — needs `VITE_VAPID_PUBLIC_KEY`, the `push_subscriptions`
  table, and `supabase/functions/send-push` deployed with a Database Webhook
  on `messages` INSERT. See `.env.example`.

**A PWA cannot ring like a phone call.** Background push on Android can be
delayed by battery optimization, and the full-screen ringing APIs are native-
only. If a karigar not answering is the real problem, an SMS fallback and
auto-reassign will solve it and chat notifications will not.

## Job lifecycle, cross-audit and strikes

```
open → assigned → awaiting_confirmation → completed
```

**Claiming.** A karigar who has unlocked a lead can take the job. First claim
wins, the job leaves the open board, and the audit clock starts.

**The unconfirmed-job cap.** A karigar may hold `max_unconfirmed_jobs`
(default 2) jobs in `assigned` before the lead centre locks. What releases
the lock is the karigar's *own* "Kaam mukammal" — not the customer's reply.
That is deliberate: gating a karigar's income on a customer who has stopped
opening the app would paralyse the supply side permanently. A job in
`awaiting_confirmation` does not count against the cap.

**Dual confirmation.** The karigar reports what they charged. The customer is
asked the same question separately, amount mandatory and rating optional. The
karigar's figure is deliberately **not shown** to the customer — if it were,
they would simply agree with it and the cross-check would confirm nothing.

**The audit.** Commission is charged on the **higher** of the two figures, so
under-reporting gains nothing. A gap beyond
`discrepancy_tolerance_percent` (default 20%) flags the job and issues a
strike. The tolerance exists because amounts differ for honest reasons —
parts bought separately, scope changed on site, a discount given — and a
zero-tolerance rule would strike honest karigars.

**Timeout.** After `confirmation_timeout_days` (default 7) a silent
customer's job closes on the karigar's figure and commission is charged.
Called lazily when the lead centre loads and from the admin Audit tab; in
production schedule `close_stale_confirmations()` with pg_cron.

**Strikes.** Escalating, and every one voidable from the admin Audit tab —
voiding refunds the fine, lifts the freeze and un-bans a voided strike 3.

| Level | Consequence |
| --- | --- |
| 1 | Lead access frozen for `strike1_freeze_hours` (24h) |
| 2 | `strike2_fine` (500 PKR) from the wallet + `strike2_suspend_days` (7d) suspension |
| 3 | Account banned, CNIC and phone written to `blocked_identities` |

**Commission collection without a payment rail.** The platform never holds
the customer's cash, so commission cannot be taken at the point of payment.
Instead the wallet is allowed to go **negative**, and a negative balance
locks lead access until it is cleared. That is the only real leverage
available: you cannot take the money, but you can withhold the next job.

Commission runs independently of the lead fee — `monetization_active` and
`commission_active` are separate switches, so you can run either, both, or
neither without a deploy.

## Directory contact reveal (pay-per-lead)

Browsing the directory is free. The **phone number is not**, and it is not in
the page at all until it is paid for.

When a customer taps **Contact / Call Now**, `reveal_contact()` charges the
karigar's wallet and returns the number. The fee lands *before* the call
connects, so it does not matter whether the deal then happens on a call, on
WhatsApp, or at the customer's door.

**The customer never pays and is never shown the fee.** Charging the demand
side would kill a marketplace that still needs volume; the karigar earns from
the job, so the karigar pays for the introduction.

| Setting | Default | Meaning |
| --- | --- | --- |
| `directory_charge_active` | `true` | Charge on reveal at all |
| `directory_contact_cost` | `50` | PKR per reveal — priced above a job-board lead, because the customer picked this karigar by name |
| `contact_dedupe_days` | `7` | Same customer + karigar is charged once per this window |

Two fairness rules, both of which exist to keep karigars from feeling robbed:

- **Dedupe.** A second tap inside the window returns the number free. Without
  it, one customer's two taps bill twice and the karigar concludes the
  platform is stealing.
- **Refunds.** Admin → Audit → Contacts lists every reveal with a refund
  button, for the tap that never became a call. It writes a ledger entry, so
  the correction is auditable.

**A karigar who cannot pay stops being contactable** rather than being pushed
into debt. A job-board unlock is something the karigar chose; an inbound
directory call is not, so billing them for a call they never asked for would
be indefensible. Their card reads "Filhaal available nahi" — which is also
the incentive to stay topped up, since an empty wallet means no inbound work.

### Why the paywall is real and not decoration

This needed a security fix, not just a UI change. Previously
`profiles_self_read` made any profile row public if it had a technician
listing, and `tech_public_read` was `USING (true)` — so **any signed-in user
could read every karigar's `phone_number` and `whatsapp_number` straight off
the REST API**, whatever the buttons did.

Now:

- `profiles` is readable only by its owner and admins.
- `technician_profiles` is readable only by its owner and admins (it carries
  `whatsapp_number`).
- The directory reads a **`directory_technicians` view** whose column list
  contains no contact field at all. It intentionally runs with owner rights so
  it can expose `full_name` past those policies — safe only because nothing
  private is selected. **Do not add a phone column to that view.**
- Numbers come from `reveal_contact()` and `my_revealed_contacts()`, and
  nowhere else.

The demo backend nulls `phone_number` in directory rows too, so a UI bug
cannot leak on one backend what the other withholds.

## Privacy

A customer's phone number is the product, so `profiles` is not world-readable.
Technician rows *are* readable — publishing a listing is the act of consent,
and the directory has to dial the number. Customer rows come back only through
`unlock_lead()` and `my_unlocked_contacts()`, both of which are scoped to leads
the calling technician has already paid for.

## Project structure

```
src/
  lib/
    db.js          One data interface, two backends (supabase | demo).
    supabase.js    Client + capability flags.
    demoData.js    Seeded D.I. Khan technicians and jobs.
    format.js      PKR, E.164 phone, CNIC, relative time, phone masking.
    chat.js        Threads, messages, offers, realtime (both backends).
    media.js       Image / video / voice compression.
    blobStore.js   IndexedDB media store for the demo backend.
    push.js        Web Push permission and subscription.
    installPrompt.js  Catches beforeinstallprompt at module scope.
    constants.js   Areas, categories, Roman-Urdu labels.
  store/session.jsx  Profile, karigar listing, remote config, ban state.
  components/      AppShell, CategoryTile, TechnicianCard, VoiceRecorder, ui.
    admin/         Overview, Karigars, Users, Jobs, Settings, BanSheet.
    chat/          MessageBubble, Composer, OfferSheet, useMediaUrl.
  pages/           Onboarding, Home, Directory, PostJob, Me → MyJobs |
                   LeadCenter, Inbox, Chat, AdminConfig, Banned.
supabase/functions/send-push/  Edge Function for background push.
supabase/schema.sql  Tables, RLS, RPCs, storage, seed data.
scripts/gen-icons.mjs  Rasterises the PWA icons (npm run icons).
```

## Design notes

The palette, the 480px shell and Inter are fixed by the brand spec. Three
decisions were left open and made here:

- **Category tiles are shop signboards.** Roman Urdu is the primary label
  because that is what a customer says out loud ("Bijli Ka Kaam"); English sits
  under it in small caps; and the Urdu script is watermarked behind the icon in
  Noto Nastaliq Urdu. The watermark does real work — it is the fastest thing to
  recognise for someone who reads Nastaliq more comfortably than Latin.
- **One cultural nod, used once.** A chevron ribbon derived from truck-art
  border bands appears on the emergency banner and nowhere else. It was tried
  on the verified badge too and cut: at 10px the chevrons read as a rendering
  artefact striking through the text.
- **Money never jitters.** Every PKR amount, wallet balance, rating and phone
  number is set in tabular numerals.

Nastaliq is set with its own line-height (`.ur`); Inter cannot render the script
at all, so the two faces are not interchangeable.

## Accessibility

48px minimum touch targets, visible keyboard focus, `prefers-reduced-motion`
respected, labelled form fields with inline errors, and `aria-hidden` on
decorative glyphs so a screen reader is not read each category three times.

## Known gaps

- **Collusion defeats the cross-audit entirely.** Matching two reported
  amounts only catches *unilateral* under-reporting. If the karigar says "app
  mein 500 likh dena, mai tumse 200 kam le loonga", both sides report 500,
  the figures match, and the audit passes cleanly on a commission of 50
  instead of 200. Both parties gain, so this is the likely failure mode — and
  no matching logic can detect it. Holding the payment is the only real fix.
- **Commission on an empty wallet is a debt, not a collection.** The karigar
  already has the cash. A negative balance locks lead access, which is real
  leverage, but a karigar who no longer wants leads simply walks away.
- **CNIC verification is manual, so the strike-3 identity block is soft.**
  Nothing is checked against NADRA, so `blocked_identities` blocks a *typed*
  CNIC. A new SIM and a relative's CNIC defeats it.
- **First claim wins.** Several karigars may each pay to unlock the same
  lead, but only one can claim the job. The others' fee buys a chance, not a
  job — watch whether that feels unfair enough to churn supply.
- **No realtime.** The lead board refreshes on navigation, not on a
  subscription. Supabase Realtime on `service_requests` is the natural fix.
- **Voice notes in demo mode** are stored inline as data URLs and can hit the
  localStorage quota; the app surfaces that as a real error rather than
  dropping the recording silently.
- **A number spoken in a voice note** still leaks past the paywall — see the
  section above.
- **No iOS install path.** Deliberate; Android is the pilot target.
- **Disintermediation is not solved, and cannot be by software.** Once a
  karigar reaches a customer's door, numbers get exchanged. Masking only
  protects the first contact, which is the thing already being sold. The
  durable levers are a subscription instead of per-lead pricing, ratings that
  accrue only for in-app jobs, and customer-side warranty.
