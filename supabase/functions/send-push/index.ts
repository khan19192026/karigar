/**
 * Sends a Web Push when a message row is inserted.
 *
 * Wire it up as a Database Webhook (Supabase dashboard → Database → Webhooks):
 *   Table:  messages
 *   Events: INSERT
 *   Type:   Supabase Edge Function → send-push
 *
 * Deploy:
 *   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@example.com
 *   supabase functions deploy send-push
 *
 * Generate the key pair once with:
 *   npx web-push generate-vapid-keys
 * The public key also goes into the app as VITE_VAPID_PUBLIC_KEY.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'https://esm.sh/web-push@3.6.7'

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:support@example.com'

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

// Service role: this needs to read the recipient's subscriptions, which RLS
// deliberately restricts to the owner.
const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

function previewOf(record: Record<string, unknown>): string {
  switch (record.kind) {
    case 'text':
      return String(record.body ?? '').slice(0, 140)
    case 'voice':
      return 'Voice note aayi hai'
    case 'image':
      return 'Photo aayi hai'
    case 'video':
      return 'Video aayi hai'
    case 'offer':
      return `Naya offer: PKR ${record.offer_amount}`
    case 'system':
      return String(record.body ?? '')
    default:
      return 'Naya message'
  }
}

Deno.serve(async (req) => {
  try {
    const { record } = await req.json()
    if (!record?.conversation_id) {
      return new Response('ignored', { status: 200 })
    }

    const { data: conv } = await admin
      .from('conversations')
      .select('customer_id, technician_id, technician:technician_profiles(user_id, shop_name)')
      .eq('id', record.conversation_id)
      .maybeSingle()

    if (!conv) return new Response('no conversation', { status: 200 })

    // Notify the participant who did not send it.
    const technicianUserId = (conv.technician as { user_id?: string } | null)?.user_id
    const recipientId =
      record.sender_id === conv.customer_id ? technicianUserId : conv.customer_id

    if (!recipientId || recipientId === record.sender_id) {
      return new Response('no recipient', { status: 200 })
    }

    const [{ data: sender }, { data: subs }] = await Promise.all([
      admin.from('profiles').select('full_name').eq('id', record.sender_id).maybeSingle(),
      admin.from('push_subscriptions').select('*').eq('user_id', recipientId),
    ])

    if (!subs?.length) return new Response('no subscriptions', { status: 200 })

    const payload = JSON.stringify({
      title: sender?.full_name ?? 'Karigar D.I. Khan',
      body: previewOf(record),
      url: `/chats/${record.conversation_id}`,
      tag: `conv-${record.conversation_id}`,
    })

    const results = await Promise.allSettled(
      subs.map((s) =>
        webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
        ),
      ),
    )

    // A 404/410 means the browser threw the subscription away. Clean up, or
    // the table fills with endpoints that can never be delivered.
    const dead = results
      .map((r, i) => ({ r, endpoint: subs[i].endpoint }))
      .filter(
        ({ r }) =>
          r.status === 'rejected' &&
          [404, 410].includes((r.reason as { statusCode?: number })?.statusCode ?? 0),
      )
      .map(({ endpoint }) => endpoint)

    if (dead.length) {
      await admin.from('push_subscriptions').delete().in('endpoint', dead)
    }

    return new Response(JSON.stringify({ sent: results.length, pruned: dead.length }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})
