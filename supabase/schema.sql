-- ═══════════════════════════════════════════════════════════════════════════
--  Karigar D.I. Khan — database schema
--  Run this once in the Supabase SQL editor on a fresh project.
--  Safe to re-run: every statement is guarded.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────── 1. TABLES ──

CREATE TABLE IF NOT EXISTS profiles (
    id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    full_name TEXT NOT NULL,
    phone_number TEXT UNIQUE NOT NULL,
    user_role TEXT CHECK (user_role IN ('customer', 'technician', 'admin')) DEFAULT 'customer',
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS categories (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name_en TEXT NOT NULL,
    name_ur TEXT NOT NULL,
    icon_name TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS technician_profiles (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
    category_id UUID REFERENCES categories(id),
    shop_name TEXT,
    address_area TEXT NOT NULL,
    experience_years INT DEFAULT 1,
    cnic_number TEXT,
    is_verified BOOLEAN DEFAULT FALSE,
    wallet_balance NUMERIC DEFAULT 0.00,
    rating NUMERIC(2,1) DEFAULT 5.0,
    is_available BOOLEAN DEFAULT TRUE,
    whatsapp_number TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS service_requests (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    customer_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    category_id UUID REFERENCES categories(id),
    title TEXT NOT NULL,
    description TEXT,
    audio_note_url TEXT,
    area_location TEXT NOT NULL,
    proposed_budget NUMERIC,
    status TEXT CHECK (status IN ('open', 'assigned', 'completed', 'cancelled')) DEFAULT 'open',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_config (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ── Added beyond the original spec, because the lead-unlock feature cannot
--    work without them: something has to record who unlocked what, and the
--    wallet needs an auditable ledger rather than a bare balance column.

CREATE TABLE IF NOT EXISTS lead_unlocks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    technician_id UUID REFERENCES technician_profiles(id) ON DELETE CASCADE,
    request_id UUID REFERENCES service_requests(id) ON DELETE CASCADE,
    cost_paid NUMERIC NOT NULL DEFAULT 0,
    was_free BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (technician_id, request_id)   -- never charge twice for one lead
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    technician_id UUID REFERENCES technician_profiles(id) ON DELETE CASCADE,
    amount NUMERIC NOT NULL,              -- negative = debit, positive = top-up
    kind TEXT CHECK (kind IN ('topup', 'lead_unlock', 'adjustment')) NOT NULL,
    reference TEXT,                       -- JazzCash/EasyPaisa TID, or request id
    balance_after NUMERIC,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ── Moderation. Added so an admin can take an account off the platform
--    without deleting it: a ban has to be reversible, and the reason has to
--    survive so a second admin knows why.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS banned_reason TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS banned_at TIMESTAMP WITH TIME ZONE;

-- ── Job lifecycle, cross-audit and strikes ──────────────────────────────
--
--  The status set grows beyond the original four because a job now has a
--  stage where the karigar has reported finishing but the customer has not
--  answered yet. That stage is where the cross-audit waits.

ALTER TABLE service_requests
  ADD COLUMN IF NOT EXISTS assigned_technician_id UUID REFERENCES technician_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_at             TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS agreed_amount           NUMERIC,  -- reserved for the offer engine
  ADD COLUMN IF NOT EXISTS technician_amount       NUMERIC,
  ADD COLUMN IF NOT EXISTS technician_finished_at  TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS customer_amount         NUMERIC,
  ADD COLUMN IF NOT EXISTS customer_confirmed_at   TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS customer_rating         INT CHECK (customer_rating BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS commission_charged      NUMERIC,
  ADD COLUMN IF NOT EXISTS has_discrepancy         BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS closed_reason           TEXT;    -- confirmed | auto_timeout | admin

ALTER TABLE service_requests DROP CONSTRAINT IF EXISTS service_requests_status_check;
ALTER TABLE service_requests ADD CONSTRAINT service_requests_status_check
  CHECK (status IN ('open', 'assigned', 'awaiting_confirmation', 'completed', 'cancelled'));

ALTER TABLE technician_profiles
  ADD COLUMN IF NOT EXISTS strike_count             INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lead_access_frozen_until TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS jobs_completed           INT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS technician_strikes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    technician_id UUID REFERENCES technician_profiles(id) ON DELETE CASCADE,
    request_id UUID REFERENCES service_requests(id) ON DELETE SET NULL,
    level INT NOT NULL,
    reason TEXT NOT NULL,
    fine_amount NUMERIC NOT NULL DEFAULT 0,
    -- A strike issued by the automatic audit can be wrong: parts bought
    -- separately, scope changed on site, or a customer misremembering. An
    -- admin must be able to void one, which is why this is not just a counter.
    is_void BOOLEAN NOT NULL DEFAULT FALSE,
    void_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Strike 3 blocks the identity, not just the account. Note the honest
-- limitation: nothing here is checked against NADRA, so this blocks a
-- *typed* CNIC. A new SIM and a relative's CNIC defeats it.
CREATE TABLE IF NOT EXISTS blocked_identities (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    cnic_number TEXT,
    phone_number TEXT,
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ── Directory contact reveals (pay-per-lead) ────────────────────────────
--
--  Browsing the directory is free; the phone number is not. When a customer
--  taps "Contact", the karigar's wallet is charged and the number is
--  revealed — so the fee is captured before the call connects, whether the
--  deal then happens on a call, on WhatsApp, or in person.

CREATE TABLE IF NOT EXISTS contact_reveals (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    customer_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    technician_id UUID REFERENCES technician_profiles(id) ON DELETE CASCADE,
    cost_paid NUMERIC NOT NULL DEFAULT 0,
    was_free BOOLEAN NOT NULL DEFAULT FALSE,
    refunded BOOLEAN NOT NULL DEFAULT FALSE,
    refund_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ── In-app chat, media and offers ───────────────────────────────────────
--
--  Conversations are keyed on (customer, karigar, job) so the same pair can
--  hold separate threads for separate jobs, and a directory enquiry with no
--  job attached gets its own thread with request_id NULL.

CREATE TABLE IF NOT EXISTS conversations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    customer_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    technician_id UUID REFERENCES technician_profiles(id) ON DELETE CASCADE,
    request_id UUID REFERENCES service_requests(id) ON DELETE SET NULL,
    last_message_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_message_preview TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- One thread per pair per job. NULLs are distinct in a UNIQUE index, so the
-- no-job case needs its own partial index to stay single.
CREATE UNIQUE INDEX IF NOT EXISTS idx_conv_unique_job
  ON conversations (customer_id, technician_id, request_id)
  WHERE request_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_conv_unique_nojob
  ON conversations (customer_id, technician_id)
  WHERE request_id IS NULL;

CREATE TABLE IF NOT EXISTS messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    kind TEXT NOT NULL CHECK (kind IN ('text', 'voice', 'image', 'video', 'offer', 'system')),
    body TEXT,                       -- text, or the offer's service description
    media_url TEXT,
    media_duration_ms INT,
    media_size_bytes INT,
    offer_amount NUMERIC,
    offer_status TEXT CHECK (offer_status IN ('pending', 'accepted', 'declined', 'superseded')),
    read_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Web Push endpoints. One row per device, so a user with a phone and a
-- desktop gets both.
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    endpoint TEXT UNIQUE NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────── 2. INDEXES ──

CREATE INDEX IF NOT EXISTS idx_requests_open       ON service_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_requests_customer   ON service_requests (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_requests_area       ON service_requests (area_location);
CREATE INDEX IF NOT EXISTS idx_tech_area           ON technician_profiles (address_area);
CREATE INDEX IF NOT EXISTS idx_tech_category       ON technician_profiles (category_id);
CREATE INDEX IF NOT EXISTS idx_unlocks_technician  ON lead_unlocks (technician_id);
CREATE INDEX IF NOT EXISTS idx_txn_technician      ON wallet_transactions (technician_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_requests_assigned   ON service_requests (assigned_technician_id, status);
CREATE INDEX IF NOT EXISTS idx_requests_pending    ON service_requests (status, technician_finished_at);
CREATE INDEX IF NOT EXISTS idx_strikes_technician  ON technician_strikes (technician_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_blocked_cnic        ON blocked_identities (cnic_number);
CREATE INDEX IF NOT EXISTS idx_blocked_phone       ON blocked_identities (phone_number);
CREATE INDEX IF NOT EXISTS idx_conv_customer       ON conversations (customer_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conv_technician     ON conversations (technician_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_thread     ON messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_unread     ON messages (conversation_id, read_at) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_push_user           ON push_subscriptions (user_id);
CREATE INDEX IF NOT EXISTS idx_reveals_pair        ON contact_reveals (customer_id, technician_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reveals_technician  ON contact_reveals (technician_id, created_at DESC);

-- ───────────────────────────────────────────────────────── 3. SEED DATA ──

INSERT INTO app_config (key, value, description) VALUES
  ('monetization_active',  'false',           'Enable/Disable Lead unlock cost'),
  ('lead_unlock_cost',     '30',              'Cost in PKR per lead unlock'),
  ('free_leads_allowance', '5',               'Free leads given to new technicians'),
  ('support_whatsapp',     '"923000000000"',  'Admin support line'),
  -- Commission is independent of the lead fee: run either, both, or neither.
  ('commission_active',    'false',           'Deduct a percentage of the job value on completion'),
  ('commission_percent',   '10',              'Commission percentage of the final job amount'),
  -- Reported amounts differ for honest reasons (parts bought separately,
  -- scope changed, a discount given). Only a gap beyond this is treated as
  -- misreporting, so an honest karigar is not struck for rounding.
  ('discrepancy_tolerance_percent', '20',     'Allowed gap between the two reported amounts'),
  ('max_unconfirmed_jobs', '2',               'Jobs a karigar may hold before the lead centre locks'),
  ('confirmation_timeout_days', '7',          'After this, a job closes on the karigar''s figure'),
  ('strike1_freeze_hours', '24',              'Lead access freeze on strike 1'),
  ('strike2_fine',         '500',             'Fine in PKR on strike 2'),
  ('strike2_suspend_days', '7',               'Suspension length on strike 2'),
  -- Directory contact reveals. Priced above a job-board lead because the
  -- customer picked this karigar by name: the intent is higher.
  ('directory_charge_active', 'true',         'Charge the karigar when a customer reveals their contact'),
  ('directory_contact_cost', '50',            'Cost in PKR per contact reveal'),
  ('contact_dedupe_days',  '7',               'Same customer + karigar is charged once per this many days')
ON CONFLICT (key) DO NOTHING;

INSERT INTO categories (name_en, name_ur, icon_name, sort_order) VALUES
  ('AC Repair',        'اے سی کی مرمت',  'ac',         1),
  ('Electrician',      'بجلی کا کام',    'electric',   2),
  ('Plumber',          'نل کا کام',      'plumb',      3),
  ('Carpenter',        'لکڑی کا کام',    'carpenter',  4),
  ('Generator Tech',   'جنریٹر مرمت',    'generator',  5),
  ('Appliance Repair', 'گھریلو سامان',   'appliance',  6),
  ('Painter',          'رنگ و روغن',     'painter',    7),
  ('Auto Mechanic',    'گاڑی مستری',     'auto',       8)
ON CONFLICT DO NOTHING;

-- ──────────────────────────────────────────────── 4. HELPER FUNCTIONS ──

-- Reads a config value with a fallback, so a deleted row can never break
-- the unlock flow.
CREATE OR REPLACE FUNCTION cfg(p_key TEXT, p_default JSONB)
RETURNS JSONB LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT value FROM app_config WHERE key = p_key), p_default);
$$;

-- A banned admin is not an admin — otherwise banning stops being reversible
-- from the other side.
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND p.user_role = 'admin' AND NOT p.is_banned
  );
$$;

-- Named user_is_banned, not is_banned, so it can never be confused with the
-- column of that name inside a policy expression.
CREATE OR REPLACE FUNCTION user_is_banned(p_user UUID DEFAULT NULL)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT p.is_banned FROM profiles p WHERE p.id = COALESCE(p_user, auth.uid())),
    FALSE
  );
$$;

-- Creates the profile row when a user signs up, pulling the name/role/phone
-- out of the sign-up metadata so the client never needs a second round-trip.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO profiles (id, full_name, phone_number, user_role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', 'Karigar user'),
    COALESCE(NEW.phone, NEW.raw_user_meta_data ->> 'phone_number', NEW.id::text),
    COALESCE(NEW.raw_user_meta_data ->> 'user_role', 'customer')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

CREATE OR REPLACE FUNCTION touch_app_config()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_app_config_update ON app_config;
CREATE TRIGGER on_app_config_update
  BEFORE UPDATE ON app_config
  FOR EACH ROW EXECUTE FUNCTION touch_app_config();

-- ──────────────────────────────────────────── 5. THE LEAD UNLOCK RPC ──
--
--  Money must never be deducted from the browser. This does the whole
--  thing in one transaction: check the config, spend a free lead if one
--  is left, otherwise debit the wallet, record the ledger entry, and only
--  then hand back the customer's contact details.
--
--  Raises 'INSUFFICIENT_BALANCE' so the client can open the top-up sheet.

CREATE OR REPLACE FUNCTION unlock_lead(p_request_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tech        technician_profiles%ROWTYPE;
  v_request     service_requests%ROWTYPE;
  v_customer    profiles%ROWTYPE;
  v_monetized   BOOLEAN;
  v_cost        NUMERIC;
  v_allowance   INT;
  v_free_used   INT;
  v_charge      NUMERIC := 0;
  v_was_free    BOOLEAN := FALSE;
  v_new_balance NUMERIC;
BEGIN
  -- Lock the technician row for the duration: two taps on a flaky
  -- connection must not double-spend.
  IF user_is_banned(auth.uid()) THEN
    RAISE EXCEPTION 'ACCOUNT_BANNED';
  END IF;

  SELECT * INTO v_tech FROM technician_profiles
    WHERE user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_A_TECHNICIAN';
  END IF;

  -- The strike freeze, the unpaid-commission lock and the unconfirmed-job
  -- cap all gate lead access. Checked here as well as in the UI, because
  -- this function is the only door to a customer's number.
  DECLARE
    v_gate JSONB := technician_gate();
  BEGIN
    IF v_gate ->> 'blocked_reason' IS NOT NULL THEN
      RAISE EXCEPTION '%', v_gate ->> 'blocked_reason';
    END IF;
  END;

  SELECT * INTO v_request FROM service_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'REQUEST_NOT_FOUND';
  END IF;

  SELECT * INTO v_customer FROM profiles WHERE id = v_request.customer_id;

  -- Already paid for? Just return the contact again, free.
  IF EXISTS (SELECT 1 FROM lead_unlocks
             WHERE technician_id = v_tech.id AND request_id = p_request_id) THEN
    RETURN jsonb_build_object(
      'already_unlocked', TRUE,
      'charged',          0,
      'wallet_balance',   v_tech.wallet_balance,
      'full_name',        v_customer.full_name,
      'phone_number',     v_customer.phone_number
    );
  END IF;

  v_monetized := (cfg('monetization_active',  'false'::jsonb))::boolean;
  v_cost      := (cfg('lead_unlock_cost',     '30'::jsonb))::numeric;
  v_allowance := (cfg('free_leads_allowance', '5'::jsonb))::int;

  IF v_monetized THEN
    SELECT COUNT(*) INTO v_free_used FROM lead_unlocks
      WHERE technician_id = v_tech.id AND was_free;

    IF v_free_used < v_allowance THEN
      v_was_free := TRUE;
    ELSIF v_tech.wallet_balance >= v_cost THEN
      v_charge := v_cost;
    ELSE
      RAISE EXCEPTION 'INSUFFICIENT_BALANCE';
    END IF;
  ELSE
    -- Monetization switched off: every lead is free, and it does not
    -- burn the technician's free allowance.
    v_was_free := FALSE;
  END IF;

  v_new_balance := v_tech.wallet_balance - v_charge;

  UPDATE technician_profiles
    SET wallet_balance = v_new_balance
    WHERE id = v_tech.id;

  INSERT INTO lead_unlocks (technician_id, request_id, cost_paid, was_free)
    VALUES (v_tech.id, p_request_id, v_charge, v_was_free);

  IF v_charge > 0 THEN
    INSERT INTO wallet_transactions
      (technician_id, amount, kind, reference, balance_after)
    VALUES
      (v_tech.id, -v_charge, 'lead_unlock', p_request_id::text, v_new_balance);
  END IF;

  RETURN jsonb_build_object(
    'already_unlocked', FALSE,
    'charged',          v_charge,
    'was_free',         v_was_free,
    'wallet_balance',   v_new_balance,
    'full_name',        v_customer.full_name,
    'phone_number',     v_customer.phone_number
  );
END;
$$;

-- ──────────────────────────────────── 5b. CONTACTS ALREADY PAID FOR ──
--
--  A technician who has bought a lead must still see the number after
--  closing the app. The profiles policy deliberately hides customer rows,
--  so this SECURITY DEFINER function is the one way back to them — and it
--  returns strictly the contacts this caller has already unlocked.

CREATE OR REPLACE FUNCTION my_unlocked_contacts()
RETURNS TABLE (request_id UUID, full_name TEXT, phone_number TEXT)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT lu.request_id, p.full_name, p.phone_number
  FROM lead_unlocks lu
  JOIN technician_profiles t ON t.id = lu.technician_id
  JOIN service_requests sr   ON sr.id = lu.request_id
  JOIN profiles p            ON p.id = sr.customer_id
  WHERE t.user_id = auth.uid();
$$;

-- ──────────────────────────────── 5d. JOB LIFECYCLE & CROSS-AUDIT ──
--
--  open → assigned → awaiting_confirmation → completed
--
--  The karigar's own "Mark as Finished" is what releases the unconfirmed-job
--  lock, deliberately: a karigar must never be paralysed because a customer
--  stopped opening the app. The cross-audit then waits separately for the
--  customer, and falls back to the karigar's figure after a timeout.

/** Everything the lead centre needs to decide whether leads are available. */
CREATE OR REPLACE FUNCTION technician_gate()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tech        technician_profiles%ROWTYPE;
  v_unconfirmed INT;
  v_max         INT;
  v_frozen      BOOLEAN;
BEGIN
  SELECT * INTO v_tech FROM technician_profiles WHERE user_id = auth.uid();
  IF NOT FOUND THEN
    RETURN jsonb_build_object('is_technician', FALSE);
  END IF;

  v_max := (cfg('max_unconfirmed_jobs', '2'::jsonb))::int;

  SELECT COUNT(*) INTO v_unconfirmed FROM service_requests
   WHERE assigned_technician_id = v_tech.id AND status = 'assigned';

  v_frozen := v_tech.lead_access_frozen_until IS NOT NULL
              AND v_tech.lead_access_frozen_until > NOW();

  RETURN jsonb_build_object(
    'is_technician',      TRUE,
    'technician_id',      v_tech.id,
    'wallet_balance',     v_tech.wallet_balance,
    'strike_count',       v_tech.strike_count,
    'frozen_until',       v_tech.lead_access_frozen_until,
    'is_frozen',          v_frozen,
    'unconfirmed_jobs',   v_unconfirmed,
    'max_unconfirmed',    v_max,
    'jobs_completed',     v_tech.jobs_completed,
    -- Order matters: the message shown is the first blocker found.
    'blocked_reason',     CASE
                            WHEN user_is_banned(auth.uid()) THEN 'BANNED'
                            WHEN v_frozen                   THEN 'FROZEN'
                            WHEN v_tech.wallet_balance < 0   THEN 'NEGATIVE_BALANCE'
                            WHEN v_unconfirmed >= v_max      THEN 'TOO_MANY_UNCONFIRMED'
                            ELSE NULL
                          END
  );
END;
$$;

/** Karigar takes a job they already paid to unlock. First claim wins. */
CREATE OR REPLACE FUNCTION claim_job(p_request_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tech technician_profiles%ROWTYPE;
  v_gate JSONB;
BEGIN
  SELECT * INTO v_tech FROM technician_profiles WHERE user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_A_TECHNICIAN'; END IF;

  v_gate := technician_gate();
  IF v_gate ->> 'blocked_reason' IS NOT NULL THEN
    RAISE EXCEPTION '%', v_gate ->> 'blocked_reason';
  END IF;

  -- You cannot take a job whose contact you never bought.
  IF NOT EXISTS (SELECT 1 FROM lead_unlocks
                 WHERE technician_id = v_tech.id AND request_id = p_request_id) THEN
    RAISE EXCEPTION 'LEAD_NOT_UNLOCKED';
  END IF;

  UPDATE service_requests
     SET status = 'assigned',
         assigned_technician_id = v_tech.id,
         assigned_at = NOW()
   WHERE id = p_request_id AND status = 'open';

  IF NOT FOUND THEN RAISE EXCEPTION 'JOB_NOT_OPEN'; END IF;

  RETURN technician_gate();
END;
$$;

/** "Mark as Finished" — the karigar reports what they actually charged. */
CREATE OR REPLACE FUNCTION technician_finish_job(p_request_id UUID, p_amount NUMERIC)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tech technician_profiles%ROWTYPE;
BEGIN
  IF p_amount IS NULL OR p_amount < 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;

  SELECT * INTO v_tech FROM technician_profiles WHERE user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_A_TECHNICIAN'; END IF;

  UPDATE service_requests
     SET status = 'awaiting_confirmation',
         technician_amount = p_amount,
         technician_finished_at = NOW()
   WHERE id = p_request_id
     AND assigned_technician_id = v_tech.id
     AND status = 'assigned';

  IF NOT FOUND THEN RAISE EXCEPTION 'JOB_NOT_ASSIGNED_TO_YOU'; END IF;

  RETURN technician_gate();
END;
$$;

/**
 * Issues a strike and applies its consequence. Called by the audit, and by
 * an admin. Levels escalate on the karigar's existing count.
 */
CREATE OR REPLACE FUNCTION issue_strike(p_tech_id UUID, p_reason TEXT, p_request_id UUID DEFAULT NULL)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_level   INT;
  v_fine    NUMERIC := 0;
  v_tech    technician_profiles%ROWTYPE;
  v_balance NUMERIC;
BEGIN
  SELECT * INTO v_tech FROM technician_profiles WHERE id = p_tech_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TECHNICIAN_NOT_FOUND'; END IF;

  v_level := v_tech.strike_count + 1;

  IF v_level = 1 THEN
    UPDATE technician_profiles
       SET strike_count = 1,
           lead_access_frozen_until = NOW() + ((cfg('strike1_freeze_hours', '24'::jsonb))::int || ' hours')::interval
     WHERE id = p_tech_id;

  ELSIF v_level = 2 THEN
    v_fine := (cfg('strike2_fine', '500'::jsonb))::numeric;
    v_balance := v_tech.wallet_balance - v_fine;
    UPDATE technician_profiles
       SET strike_count = 2,
           wallet_balance = v_balance,
           lead_access_frozen_until = NOW() + ((cfg('strike2_suspend_days', '7'::jsonb))::int || ' days')::interval
     WHERE id = p_tech_id;
    INSERT INTO wallet_transactions (technician_id, amount, kind, reference, balance_after)
    VALUES (p_tech_id, -v_fine, 'adjustment', 'strike-2-fine', v_balance);

  ELSE
    -- Strike 3: ban the account and block the identity.
    UPDATE technician_profiles SET strike_count = v_level WHERE id = p_tech_id;
    UPDATE profiles
       SET is_banned = TRUE,
           banned_reason = 'Strike 3 — ' || p_reason,
           banned_at = NOW()
     WHERE id = v_tech.user_id;
    UPDATE service_requests SET status = 'cancelled'
     WHERE customer_id = v_tech.user_id AND status = 'open';
    INSERT INTO blocked_identities (cnic_number, phone_number, reason)
    SELECT v_tech.cnic_number, p.phone_number, 'Strike 3 — ' || p_reason
      FROM profiles p WHERE p.id = v_tech.user_id;
  END IF;

  INSERT INTO technician_strikes (technician_id, request_id, level, reason, fine_amount)
  VALUES (p_tech_id, p_request_id, v_level, p_reason, v_fine);

  RETURN v_level;
END;
$$;

/**
 * The customer's side of the dual confirmation, and the cross-audit.
 *
 * Commission is charged on the HIGHER of the two figures, so under-reporting
 * gains nothing. If the wallet cannot cover it the balance goes negative,
 * which locks lead access until it is cleared — with no payment rail that is
 * the only real leverage available.
 */
CREATE OR REPLACE FUNCTION customer_confirm_job(p_request_id UUID, p_amount NUMERIC, p_rating INT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_req        service_requests%ROWTYPE;
  v_tech       technician_profiles%ROWTYPE;
  v_basis      NUMERIC;
  v_gap        NUMERIC;
  v_tolerance  NUMERIC;
  v_discrepant BOOLEAN := FALSE;
  v_commission NUMERIC := 0;
  v_balance    NUMERIC;
  v_strike     INT := 0;
BEGIN
  IF p_amount IS NULL OR p_amount < 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;

  SELECT * INTO v_req FROM service_requests
   WHERE id = p_request_id AND customer_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'JOB_NOT_YOURS'; END IF;
  IF v_req.status <> 'awaiting_confirmation' THEN RAISE EXCEPTION 'JOB_NOT_AWAITING'; END IF;

  SELECT * INTO v_tech FROM technician_profiles
   WHERE id = v_req.assigned_technician_id FOR UPDATE;

  v_basis := GREATEST(COALESCE(v_req.technician_amount, 0), p_amount);
  v_gap   := ABS(COALESCE(v_req.technician_amount, 0) - p_amount);
  v_tolerance := (cfg('discrepancy_tolerance_percent', '20'::jsonb))::numeric;

  -- Percentage of the larger figure, so a small job is not flagged for a
  -- small absolute gap.
  IF v_basis > 0 AND (v_gap * 100.0 / v_basis) > v_tolerance THEN
    v_discrepant := TRUE;
  END IF;

  IF (cfg('commission_active', 'false'::jsonb))::boolean AND v_tech.id IS NOT NULL THEN
    v_commission := ROUND(v_basis * (cfg('commission_percent', '10'::jsonb))::numeric / 100.0);
    v_balance := v_tech.wallet_balance - v_commission;
    UPDATE technician_profiles SET wallet_balance = v_balance WHERE id = v_tech.id;
    INSERT INTO wallet_transactions (technician_id, amount, kind, reference, balance_after)
    VALUES (v_tech.id, -v_commission, 'lead_unlock', 'commission:' || p_request_id::text, v_balance);
  END IF;

  UPDATE service_requests
     SET status = 'completed',
         customer_amount = p_amount,
         customer_confirmed_at = NOW(),
         customer_rating = p_rating,
         commission_charged = v_commission,
         has_discrepancy = v_discrepant,
         closed_reason = 'confirmed'
   WHERE id = p_request_id;

  IF v_tech.id IS NOT NULL THEN
    UPDATE technician_profiles
       SET jobs_completed = jobs_completed + 1
     WHERE id = v_tech.id;

    -- Ratings finally mean something: recompute from the real ones, and
    -- keep the 5.0 default until a karigar has actually been rated.
    IF p_rating IS NOT NULL THEN
      UPDATE technician_profiles t
         SET rating = COALESCE((
               SELECT ROUND(AVG(r.customer_rating)::numeric, 1)
                 FROM service_requests r
                WHERE r.assigned_technician_id = t.id AND r.customer_rating IS NOT NULL
             ), 5.0)
       WHERE t.id = v_tech.id;
    END IF;

    IF v_discrepant THEN
      v_strike := issue_strike(
        v_tech.id,
        format('Reported %s but customer reported %s', v_req.technician_amount, p_amount),
        p_request_id
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'discrepancy',  v_discrepant,
    'commission',   v_commission,
    'basis',        v_basis,
    'strike_level', v_strike
  );
END;
$$;

/**
 * Closes jobs the customer never confirmed, on the karigar's own figure.
 *
 * Without this, commission on a silent customer is never collected and the
 * job sits open forever. Called lazily when the lead centre loads; in
 * production schedule it with pg_cron instead.
 */
CREATE OR REPLACE FUNCTION close_stale_confirmations()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_days INT := (cfg('confirmation_timeout_days', '7'::jsonb))::int;
  v_row  RECORD;
  v_n    INT := 0;
  v_commission NUMERIC;
  v_balance    NUMERIC;
BEGIN
  FOR v_row IN
    SELECT * FROM service_requests
     WHERE status = 'awaiting_confirmation'
       AND technician_finished_at < NOW() - (v_days || ' days')::interval
  LOOP
    v_commission := 0;
    IF (cfg('commission_active', 'false'::jsonb))::boolean
       AND v_row.assigned_technician_id IS NOT NULL THEN
      v_commission := ROUND(COALESCE(v_row.technician_amount, 0)
                            * (cfg('commission_percent', '10'::jsonb))::numeric / 100.0);
      UPDATE technician_profiles
         SET wallet_balance = wallet_balance - v_commission,
             jobs_completed = jobs_completed + 1
       WHERE id = v_row.assigned_technician_id
      RETURNING wallet_balance INTO v_balance;
      INSERT INTO wallet_transactions (technician_id, amount, kind, reference, balance_after)
      VALUES (v_row.assigned_technician_id, -v_commission, 'lead_unlock',
              'commission-timeout:' || v_row.id::text, v_balance);
    END IF;

    UPDATE service_requests
       SET status = 'completed',
           commission_charged = v_commission,
           closed_reason = 'auto_timeout'
     WHERE id = v_row.id;

    v_n := v_n + 1;
  END LOOP;

  RETURN v_n;
END;
$$;

/** Is this CNIC or number blocked by a previous strike 3? */
CREATE OR REPLACE FUNCTION identity_is_blocked(p_cnic TEXT, p_phone TEXT)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM blocked_identities b
     WHERE (p_cnic IS NOT NULL AND b.cnic_number = p_cnic)
        OR (p_phone IS NOT NULL AND b.phone_number = p_phone)
  );
$$;

-- ──────────────────────── 5f. DIRECTORY CONTACT REVEAL (PAY-PER-LEAD) ──

/**
 * The public directory, with no contact details in it at all.
 *
 * This view is the whole reason the paywall is real. `full_name` lives in
 * `profiles`, which is locked down, so the directory cannot simply join it —
 * and if it could, `phone_number` would come along for the ride and anyone
 * could read every number straight off the REST API, paywall or not.
 *
 * The view runs with the owner's rights (security_invoker off, the default)
 * precisely so it can reach past those policies — and it is safe to do that
 * only because the column list below contains nothing private. Do not add
 * phone_number, whatsapp_number or cnic_number here.
 */
-- Dropped rather than replaced: CREATE OR REPLACE VIEW cannot rename or
-- reorder columns, so editing this view later would fail on a re-run.
DROP VIEW IF EXISTS directory_technicians;
CREATE VIEW directory_technicians AS
  SELECT
    t.id,
    t.user_id,
    t.category_id,
    t.shop_name,
    t.address_area,
    t.experience_years,
    t.is_verified,
    t.rating,
    t.is_available,
    t.jobs_completed,
    t.created_at,
    p.full_name,
    p.avatar_url,
    -- Whether a paid reveal can succeed right now. A karigar who cannot pay
    -- stops receiving inbound calls, which is the incentive to stay topped up.
    (
      NOT (cfg('directory_charge_active', 'true'::jsonb))::boolean
      OR t.wallet_balance >= (cfg('directory_contact_cost', '50'::jsonb))::numeric
    ) AS is_contactable
  FROM technician_profiles t
  JOIN profiles p ON p.id = t.user_id
  WHERE NOT p.is_banned;

GRANT SELECT ON directory_technicians TO anon, authenticated;

/** Contacts this customer has already paid to see, still inside the window. */
CREATE OR REPLACE FUNCTION my_revealed_contacts()
RETURNS TABLE (technician_id UUID, full_name TEXT, phone_number TEXT, whatsapp_number TEXT)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT ON (r.technician_id)
         r.technician_id, p.full_name, p.phone_number, t.whatsapp_number
    FROM contact_reveals r
    JOIN technician_profiles t ON t.id = r.technician_id
    JOIN profiles p ON p.id = t.user_id
   WHERE r.customer_id = auth.uid()
     AND r.created_at > NOW() - ((cfg('contact_dedupe_days', '7'::jsonb))::int || ' days')::interval
   ORDER BY r.technician_id, r.created_at DESC;
$$;

/**
 * Charges the karigar and returns their contact details.
 *
 * Deliberately refuses rather than pushing the karigar into debt. A
 * job-board unlock is something the karigar chose; an inbound directory call
 * is not, so billing them into a negative balance for a call they never
 * asked for would be indefensible. Instead they simply stop being
 * contactable until they top up.
 */
CREATE OR REPLACE FUNCTION reveal_contact(p_technician_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tech      technician_profiles%ROWTYPE;
  v_owner     profiles%ROWTYPE;
  v_cost      NUMERIC;
  v_charge    NUMERIC := 0;
  v_was_free  BOOLEAN := FALSE;
  v_free_used INT;
  v_allowance INT;
  v_existing  contact_reveals;
  v_balance   NUMERIC;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NOT_SIGNED_IN'; END IF;
  IF user_is_banned(auth.uid()) THEN RAISE EXCEPTION 'ACCOUNT_BANNED'; END IF;

  SELECT * INTO v_tech FROM technician_profiles WHERE id = p_technician_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TECHNICIAN_NOT_FOUND'; END IF;

  SELECT * INTO v_owner FROM profiles WHERE id = v_tech.user_id;
  IF v_owner.is_banned THEN RAISE EXCEPTION 'TECHNICIAN_UNAVAILABLE'; END IF;

  -- Already paid for inside the dedupe window: hand it back free. Without
  -- this, a customer tapping twice bills the karigar twice and the karigar
  -- concludes they are being robbed.
  SELECT * INTO v_existing FROM contact_reveals
   WHERE customer_id = auth.uid()
     AND technician_id = p_technician_id
     AND created_at > NOW() - ((cfg('contact_dedupe_days', '7'::jsonb))::int || ' days')::interval
   ORDER BY created_at DESC LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'already_revealed', TRUE,
      'charged',          0,
      'full_name',        v_owner.full_name,
      'phone_number',     v_owner.phone_number,
      'whatsapp_number',  COALESCE(v_tech.whatsapp_number, v_owner.phone_number)
    );
  END IF;

  IF (cfg('directory_charge_active', 'true'::jsonb))::boolean THEN
    v_cost      := (cfg('directory_contact_cost', '50'::jsonb))::numeric;
    v_allowance := (cfg('free_leads_allowance', '5'::jsonb))::int;

    -- One shared free-introduction budget across job leads and directory
    -- reveals, so a new karigar is not charged twice over while starting out.
    SELECT (SELECT COUNT(*) FROM lead_unlocks WHERE technician_id = v_tech.id AND was_free)
         + (SELECT COUNT(*) FROM contact_reveals WHERE technician_id = v_tech.id AND was_free)
      INTO v_free_used;

    IF v_free_used < v_allowance THEN
      v_was_free := TRUE;
    ELSIF v_tech.wallet_balance >= v_cost THEN
      v_charge := v_cost;
    ELSE
      RAISE EXCEPTION 'TECHNICIAN_UNAVAILABLE';
    END IF;
  END IF;

  v_balance := v_tech.wallet_balance - v_charge;

  UPDATE technician_profiles SET wallet_balance = v_balance WHERE id = v_tech.id;

  INSERT INTO contact_reveals (customer_id, technician_id, cost_paid, was_free)
  VALUES (auth.uid(), p_technician_id, v_charge, v_was_free);

  IF v_charge > 0 THEN
    INSERT INTO wallet_transactions (technician_id, amount, kind, reference, balance_after)
    VALUES (v_tech.id, -v_charge, 'lead_unlock', 'directory-contact', v_balance);
  END IF;

  RETURN jsonb_build_object(
    'already_revealed', FALSE,
    'charged',          v_charge,
    'was_free',         v_was_free,
    'full_name',        v_owner.full_name,
    'phone_number',     v_owner.phone_number,
    'whatsapp_number',  COALESCE(v_tech.whatsapp_number, v_owner.phone_number)
  );
END;
$$;

/** Refunds a reveal the karigar disputes — a tap that never became a call. */
CREATE OR REPLACE FUNCTION admin_refund_reveal(p_reveal_id UUID, p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row     contact_reveals;
  v_balance NUMERIC;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'NOT_ADMIN'; END IF;

  SELECT * INTO v_row FROM contact_reveals WHERE id = p_reveal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'REVEAL_NOT_FOUND'; END IF;
  IF v_row.refunded THEN RETURN; END IF;

  UPDATE contact_reveals
     SET refunded = TRUE, refund_reason = COALESCE(p_reason, 'Admin refund')
   WHERE id = p_reveal_id;

  IF v_row.cost_paid > 0 THEN
    UPDATE technician_profiles
       SET wallet_balance = wallet_balance + v_row.cost_paid
     WHERE id = v_row.technician_id
    RETURNING wallet_balance INTO v_balance;

    INSERT INTO wallet_transactions (technician_id, amount, kind, reference, balance_after)
    VALUES (v_row.technician_id, v_row.cost_paid, 'adjustment',
            'reveal-refund:' || p_reveal_id::text, v_balance);
  END IF;
END;
$$;

-- ────────────────────────────────── 5e. CHAT & THE OFFER ENGINE ──

/** True when the caller is either side of this conversation. */
CREATE OR REPLACE FUNCTION in_conversation(p_conversation_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = p_conversation_id
      AND (
        c.customer_id = auth.uid()
        OR c.technician_id IN (SELECT id FROM technician_profiles WHERE user_id = auth.uid())
      )
  );
$$;

/**
 * Finds or creates the thread between a customer and a karigar.
 *
 * Pass the *other* party; the caller's own side is filled in from auth.uid().
 * Returns the conversation id, so "Contact Now" is one round trip.
 */
CREATE OR REPLACE FUNCTION ensure_conversation(
  p_technician_id UUID DEFAULT NULL,
  p_customer_id UUID DEFAULT NULL,
  p_request_id UUID DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_customer UUID := p_customer_id;
  v_tech     UUID := p_technician_id;
  v_id       UUID;
BEGIN
  IF user_is_banned(auth.uid()) THEN RAISE EXCEPTION 'ACCOUNT_BANNED'; END IF;

  -- Whichever side the caller is, that side is theirs — never trust a
  -- client-supplied identity for the caller's own end of the thread.
  SELECT id INTO v_tech FROM technician_profiles WHERE user_id = auth.uid();
  IF v_tech IS NOT NULL THEN
    v_customer := p_customer_id;
  ELSE
    v_tech := p_technician_id;
    v_customer := auth.uid();
  END IF;

  IF v_tech IS NULL OR v_customer IS NULL THEN RAISE EXCEPTION 'MISSING_PARTY'; END IF;

  SELECT id INTO v_id FROM conversations
   WHERE customer_id = v_customer
     AND technician_id = v_tech
     AND ((p_request_id IS NULL AND request_id IS NULL) OR request_id = p_request_id);

  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  INSERT INTO conversations (customer_id, technician_id, request_id)
  VALUES (v_customer, v_tech, p_request_id)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

/** Posts a message and refreshes the thread's preview in one transaction. */
CREATE OR REPLACE FUNCTION send_message(
  p_conversation_id UUID,
  p_kind TEXT,
  p_body TEXT DEFAULT NULL,
  p_media_url TEXT DEFAULT NULL,
  p_duration_ms INT DEFAULT NULL,
  p_size_bytes INT DEFAULT NULL,
  p_offer_amount NUMERIC DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row     messages;
  v_preview TEXT;
BEGIN
  IF NOT in_conversation(p_conversation_id) THEN RAISE EXCEPTION 'NOT_A_PARTICIPANT'; END IF;
  IF user_is_banned(auth.uid()) THEN RAISE EXCEPTION 'ACCOUNT_BANNED'; END IF;

  -- A new offer supersedes any earlier pending one, so only the latest can
  -- be accepted and there is never a stale price sitting in the thread.
  IF p_kind = 'offer' THEN
    IF p_offer_amount IS NULL OR p_offer_amount <= 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;
    UPDATE messages SET offer_status = 'superseded'
     WHERE conversation_id = p_conversation_id AND kind = 'offer' AND offer_status = 'pending';
  END IF;

  INSERT INTO messages (
    conversation_id, sender_id, kind, body, media_url,
    media_duration_ms, media_size_bytes, offer_amount, offer_status
  ) VALUES (
    p_conversation_id, auth.uid(), p_kind, p_body, p_media_url,
    p_duration_ms, p_size_bytes, p_offer_amount,
    CASE WHEN p_kind = 'offer' THEN 'pending' ELSE NULL END
  ) RETURNING * INTO v_row;

  v_preview := CASE p_kind
    WHEN 'text'  THEN LEFT(COALESCE(p_body, ''), 120)
    WHEN 'voice' THEN 'Voice note'
    WHEN 'image' THEN 'Photo'
    WHEN 'video' THEN 'Video'
    WHEN 'offer' THEN 'Offer: PKR ' || p_offer_amount::text
    ELSE COALESCE(p_body, '')
  END;

  UPDATE conversations
     SET last_message_at = NOW(), last_message_preview = v_preview
   WHERE id = p_conversation_id;

  RETURN to_jsonb(v_row);
END;
$$;

CREATE OR REPLACE FUNCTION mark_conversation_read(p_conversation_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT in_conversation(p_conversation_id) THEN RAISE EXCEPTION 'NOT_A_PARTICIPANT'; END IF;
  UPDATE messages SET read_at = NOW()
   WHERE conversation_id = p_conversation_id
     AND sender_id <> auth.uid()
     AND read_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION my_unread_count()
RETURNS INT LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COUNT(*)::int FROM messages m
   JOIN conversations c ON c.id = m.conversation_id
  WHERE m.read_at IS NULL
    AND m.sender_id <> auth.uid()
    AND (
      c.customer_id = auth.uid()
      OR c.technician_id IN (SELECT id FROM technician_profiles WHERE user_id = auth.uid())
    );
$$;

/**
 * Accepts an offer and locks the price.
 *
 * Only the party who did NOT send it may accept. The agreed amount is
 * written onto the job, which moves to 'assigned' — the schema's name for
 * In-Progress. If the thread had no job attached (a directory enquiry) one
 * is created here, so every accepted offer lands in the same completion and
 * cross-audit flow as a posted job.
 */
CREATE OR REPLACE FUNCTION accept_offer(p_message_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_msg     messages;
  v_conv    conversations;
  v_tech    technician_profiles%ROWTYPE;
  v_request UUID;
  v_gate    JSONB;
BEGIN
  SELECT * INTO v_msg FROM messages WHERE id = p_message_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'OFFER_NOT_FOUND'; END IF;
  IF v_msg.kind <> 'offer' THEN RAISE EXCEPTION 'NOT_AN_OFFER'; END IF;
  IF v_msg.offer_status <> 'pending' THEN RAISE EXCEPTION 'OFFER_NOT_PENDING'; END IF;
  IF NOT in_conversation(v_msg.conversation_id) THEN RAISE EXCEPTION 'NOT_A_PARTICIPANT'; END IF;
  -- You cannot accept your own price.
  IF v_msg.sender_id = auth.uid() THEN RAISE EXCEPTION 'CANNOT_ACCEPT_OWN_OFFER'; END IF;

  SELECT * INTO v_conv FROM conversations WHERE id = v_msg.conversation_id;
  SELECT * INTO v_tech FROM technician_profiles WHERE id = v_conv.technician_id FOR UPDATE;

  -- Accepting an offer puts work in the karigar's hands, so the same gate
  -- that guards claiming a lead applies here. It is checked whichever party
  -- taps accept, because the consequence lands on the karigar either way.
  SELECT jsonb_build_object(
    'unconfirmed', (SELECT COUNT(*) FROM service_requests
                     WHERE assigned_technician_id = v_tech.id AND status = 'assigned'),
    'max', (cfg('max_unconfirmed_jobs', '2'::jsonb))::int,
    'frozen', v_tech.lead_access_frozen_until IS NOT NULL
              AND v_tech.lead_access_frozen_until > NOW(),
    'negative', v_tech.wallet_balance < 0
  ) INTO v_gate;

  IF (v_gate ->> 'frozen')::boolean   THEN RAISE EXCEPTION 'FROZEN'; END IF;
  IF (v_gate ->> 'negative')::boolean THEN RAISE EXCEPTION 'NEGATIVE_BALANCE'; END IF;
  IF (v_gate ->> 'unconfirmed')::int >= (v_gate ->> 'max')::int THEN
    RAISE EXCEPTION 'TOO_MANY_UNCONFIRMED';
  END IF;

  v_request := v_conv.request_id;

  IF v_request IS NULL THEN
    INSERT INTO service_requests (
      customer_id, category_id, title, description, area_location,
      proposed_budget, agreed_amount, status, assigned_technician_id, assigned_at
    ) VALUES (
      v_conv.customer_id,
      v_tech.category_id,
      COALESCE(NULLIF(v_msg.body, ''), 'Chat par tay hua kaam'),
      v_msg.body,
      v_tech.address_area,
      v_msg.offer_amount,
      v_msg.offer_amount,
      'assigned',
      v_tech.id,
      NOW()
    ) RETURNING id INTO v_request;

    UPDATE conversations SET request_id = v_request WHERE id = v_conv.id;
  ELSE
    UPDATE service_requests
       SET agreed_amount = v_msg.offer_amount,
           status = 'assigned',
           assigned_technician_id = v_tech.id,
           assigned_at = COALESCE(assigned_at, NOW())
     WHERE id = v_request;
  END IF;

  UPDATE messages SET offer_status = 'accepted' WHERE id = p_message_id;

  INSERT INTO messages (conversation_id, sender_id, kind, body)
  VALUES (v_msg.conversation_id, auth.uid(), 'system',
          'Offer accept ho gaya — PKR ' || v_msg.offer_amount::text || '. Kaam shuru.');

  UPDATE conversations
     SET last_message_at = NOW(),
         last_message_preview = 'Offer accepted: PKR ' || v_msg.offer_amount::text
   WHERE id = v_conv.id;

  RETURN jsonb_build_object('request_id', v_request, 'amount', v_msg.offer_amount);
END;
$$;

CREATE OR REPLACE FUNCTION decline_offer(p_message_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_msg messages;
BEGIN
  SELECT * INTO v_msg FROM messages WHERE id = p_message_id;
  IF NOT FOUND OR v_msg.kind <> 'offer' THEN RAISE EXCEPTION 'OFFER_NOT_FOUND'; END IF;
  IF NOT in_conversation(v_msg.conversation_id) THEN RAISE EXCEPTION 'NOT_A_PARTICIPANT'; END IF;
  IF v_msg.sender_id = auth.uid() THEN RAISE EXCEPTION 'CANNOT_DECLINE_OWN_OFFER'; END IF;
  UPDATE messages SET offer_status = 'declined'
   WHERE id = p_message_id AND offer_status = 'pending';
END;
$$;

-- ───────────────────────────────────────────────── 5c. ADMIN ACTIONS ──
--
--  Every one of these re-checks is_admin() itself. They are SECURITY
--  DEFINER, so the policy layer is bypassed inside them — the guard has to
--  be in the body, not only on the route that calls them.

CREATE OR REPLACE FUNCTION admin_set_ban(p_user_id UUID, p_banned BOOLEAN, p_reason TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'NOT_ADMIN';
  END IF;
  -- Without this an admin can lock themselves out of their own panel.
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'CANNOT_BAN_SELF';
  END IF;

  UPDATE profiles
     SET is_banned     = p_banned,
         banned_reason = CASE WHEN p_banned THEN p_reason ELSE NULL END,
         banned_at     = CASE WHEN p_banned THEN NOW() ELSE NULL END
   WHERE id = p_user_id;

  -- A banned customer's open jobs come off the board immediately, so no
  -- karigar pays for a lead that is about to go nowhere.
  IF p_banned THEN
    UPDATE service_requests
       SET status = 'cancelled'
     WHERE customer_id = p_user_id AND status = 'open';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION admin_set_verified(p_tech_id UUID, p_verified BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'NOT_ADMIN';
  END IF;
  UPDATE technician_profiles SET is_verified = p_verified WHERE id = p_tech_id;
END;
$$;

-- The manual side of JazzCash/EasyPaisa top-ups: a receipt arrives on
-- WhatsApp and an admin credits the wallet here. Negative amounts are
-- allowed for corrections and land in the ledger as an adjustment.
CREATE OR REPLACE FUNCTION admin_credit_wallet(p_tech_id UUID, p_amount NUMERIC, p_reference TEXT DEFAULT NULL)
RETURNS NUMERIC LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_new NUMERIC;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'NOT_ADMIN';
  END IF;
  IF p_amount = 0 THEN
    RAISE EXCEPTION 'ZERO_AMOUNT';
  END IF;

  UPDATE technician_profiles
     SET wallet_balance = wallet_balance + p_amount
   WHERE id = p_tech_id
  RETURNING wallet_balance INTO v_new;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TECHNICIAN_NOT_FOUND';
  END IF;

  INSERT INTO wallet_transactions (technician_id, amount, kind, reference, balance_after)
  VALUES (
    p_tech_id,
    p_amount,
    CASE WHEN p_amount > 0 THEN 'topup' ELSE 'adjustment' END,
    COALESCE(p_reference, 'admin'),
    v_new
  );

  RETURN v_new;
END;
$$;

/**
 * Voids a strike and undoes its consequence.
 *
 * The automatic audit will sometimes be wrong — parts bought separately, a
 * discount given, a customer misremembering or lying. Without this the
 * system has no way to be fair, and an unfair strike costs you a karigar in
 * a city where there may only be a dozen.
 */
CREATE OR REPLACE FUNCTION admin_void_strike(p_strike_id UUID, p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_strike technician_strikes%ROWTYPE;
  v_tech   technician_profiles%ROWTYPE;
  v_active INT;
  v_balance NUMERIC;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'NOT_ADMIN'; END IF;

  SELECT * INTO v_strike FROM technician_strikes WHERE id = p_strike_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'STRIKE_NOT_FOUND'; END IF;
  IF v_strike.is_void THEN RETURN; END IF;

  SELECT * INTO v_tech FROM technician_profiles WHERE id = v_strike.technician_id FOR UPDATE;

  UPDATE technician_strikes
     SET is_void = TRUE, void_reason = p_reason
   WHERE id = p_strike_id;

  -- Refund the fine if there was one.
  IF v_strike.fine_amount > 0 THEN
    v_balance := v_tech.wallet_balance + v_strike.fine_amount;
    UPDATE technician_profiles SET wallet_balance = v_balance WHERE id = v_tech.id;
    INSERT INTO wallet_transactions (technician_id, amount, kind, reference, balance_after)
    VALUES (v_tech.id, v_strike.fine_amount, 'adjustment',
            'strike-void:' || p_strike_id::text, v_balance);
  END IF;

  SELECT COUNT(*) INTO v_active FROM technician_strikes
   WHERE technician_id = v_tech.id AND NOT is_void;

  UPDATE technician_profiles
     SET strike_count = v_active,
         -- Lift the freeze: the reason for it has just been withdrawn.
         lead_access_frozen_until = NULL
   WHERE id = v_tech.id;

  -- A voided strike 3 also un-bans and unblocks the identity.
  IF v_strike.level >= 3 THEN
    UPDATE profiles
       SET is_banned = FALSE, banned_reason = NULL, banned_at = NULL
     WHERE id = v_tech.user_id;
    DELETE FROM blocked_identities
     WHERE (cnic_number IS NOT NULL AND cnic_number = v_tech.cnic_number)
        OR phone_number = (SELECT phone_number FROM profiles WHERE id = v_tech.user_id);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION admin_issue_strike(p_tech_id UUID, p_reason TEXT)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'NOT_ADMIN'; END IF;
  RETURN issue_strike(p_tech_id, p_reason, NULL);
END;
$$;

-- One round trip for the overview tiles instead of six count queries.
CREATE OR REPLACE FUNCTION admin_overview()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'NOT_ADMIN';
  END IF;

  RETURN jsonb_build_object(
    'customers',      (SELECT COUNT(*) FROM profiles WHERE user_role = 'customer'),
    'technicians',    (SELECT COUNT(*) FROM technician_profiles),
    'verified',       (SELECT COUNT(*) FROM technician_profiles WHERE is_verified),
    'banned',         (SELECT COUNT(*) FROM profiles WHERE is_banned),
    'jobs_open',      (SELECT COUNT(*) FROM service_requests WHERE status = 'open'),
    'jobs_total',     (SELECT COUNT(*) FROM service_requests),
    'leads_sold',     (SELECT COUNT(*) FROM lead_unlocks),
    'revenue',        (SELECT COALESCE(SUM(cost_paid), 0) FROM lead_unlocks),
    'commission',     (SELECT COALESCE(SUM(commission_charged), 0) FROM service_requests),
    'wallet_float',   (SELECT COALESCE(SUM(wallet_balance), 0) FROM technician_profiles),
    'in_debt',        (SELECT COUNT(*) FROM technician_profiles WHERE wallet_balance < 0),
    'awaiting',       (SELECT COUNT(*) FROM service_requests WHERE status = 'awaiting_confirmation'),
    'discrepancies',  (SELECT COUNT(*) FROM service_requests WHERE has_discrepancy),
    'strikes',        (SELECT COUNT(*) FROM technician_strikes WHERE NOT is_void)
  );
END;
$$;

-- ─────────────────────────────────────────────────────────────── 6. RLS ──

ALTER TABLE profiles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories           ENABLE ROW LEVEL SECURITY;
ALTER TABLE technician_profiles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_requests     ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_config           ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_unlocks         ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_transactions  ENABLE ROW LEVEL SECURITY;

-- profiles ────────────────────────────────────────────────────────────────
-- NOBODY's phone number is readable here — not a customer's, and not a
-- karigar's.
--
-- Technician rows used to be world-readable so the directory could show a
-- name. That quietly handed out `phone_number` too: any signed-in user could
-- read every karigar's number straight off the REST API, and the contact
-- paywall would have been decoration. The directory now reads names from the
-- `directory_technicians` view, which has no contact column in it, and
-- numbers come only from reveal_contact() after the karigar has been charged.
DROP POLICY IF EXISTS profiles_self_read ON profiles;
CREATE POLICY profiles_self_read ON profiles
  FOR SELECT USING (id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS profiles_self_write ON profiles;
CREATE POLICY profiles_self_write ON profiles
  FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS profiles_self_insert ON profiles;
CREATE POLICY profiles_self_insert ON profiles
  FOR INSERT WITH CHECK (id = auth.uid());

-- categories ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS categories_public_read ON categories;
CREATE POLICY categories_public_read ON categories
  FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS categories_admin_write ON categories;
CREATE POLICY categories_admin_write ON categories
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- technician_profiles ─────────────────────────────────────────────────────
-- NOT world-readable, because `whatsapp_number` lives on this table and
-- would otherwise be free to anyone who asked. The public directory reads
-- the `directory_technicians` view instead. A karigar still reads their own
-- row, and an admin reads all of them.
DROP POLICY IF EXISTS tech_public_read ON technician_profiles;  -- pre-paywall name
DROP POLICY IF EXISTS tech_own_read ON technician_profiles;
CREATE POLICY tech_own_read ON technician_profiles
  FOR SELECT USING (user_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS tech_self_insert ON technician_profiles;
CREATE POLICY tech_self_insert ON technician_profiles
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- A technician may edit their own listing, but must not be able to top up
-- their own wallet or mark themselves CNIC-verified.
DROP POLICY IF EXISTS tech_self_update ON technician_profiles;
CREATE POLICY tech_self_update ON technician_profiles
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND wallet_balance = (SELECT t.wallet_balance FROM technician_profiles t WHERE t.id = technician_profiles.id)
    AND is_verified   = (SELECT t.is_verified   FROM technician_profiles t WHERE t.id = technician_profiles.id)
    AND rating        = (SELECT t.rating        FROM technician_profiles t WHERE t.id = technician_profiles.id)
  );

DROP POLICY IF EXISTS tech_admin_all ON technician_profiles;
CREATE POLICY tech_admin_all ON technician_profiles
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- service_requests ────────────────────────────────────────────────────────
-- Open jobs are visible to every signed-in user so the lead centre can
-- list them. The customer's identity is protected by the profiles policy
-- above — the board shows the job, not the person.
DROP POLICY IF EXISTS requests_read ON service_requests;
CREATE POLICY requests_read ON service_requests
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND (
      is_admin()
      OR customer_id = auth.uid()
      -- A banned customer's jobs leave the board even if still 'open'.
      OR (status = 'open' AND NOT user_is_banned(customer_id))
    )
  );

DROP POLICY IF EXISTS requests_customer_insert ON service_requests;
CREATE POLICY requests_customer_insert ON service_requests
  FOR INSERT WITH CHECK (customer_id = auth.uid() AND NOT user_is_banned(auth.uid()));

DROP POLICY IF EXISTS requests_customer_update ON service_requests;
CREATE POLICY requests_customer_update ON service_requests
  FOR UPDATE USING (customer_id = auth.uid() OR is_admin())
  WITH CHECK (customer_id = auth.uid() OR is_admin());

-- app_config ──────────────────────────────────────────────────────────────
-- Readable by all (the client needs the lead price); writable by admins only.
DROP POLICY IF EXISTS config_public_read ON app_config;
CREATE POLICY config_public_read ON app_config
  FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS config_admin_write ON app_config;
CREATE POLICY config_admin_write ON app_config
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- lead_unlocks / wallet_transactions ──────────────────────────────────────
-- Read-only to the owning technician. Writes happen exclusively inside
-- unlock_lead(), which is SECURITY DEFINER and bypasses these.
DROP POLICY IF EXISTS unlocks_own_read ON lead_unlocks;
CREATE POLICY unlocks_own_read ON lead_unlocks
  FOR SELECT USING (
    technician_id IN (SELECT id FROM technician_profiles WHERE user_id = auth.uid())
    OR is_admin()
  );

ALTER TABLE technician_strikes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_identities  ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations       ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages            ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions  ENABLE ROW LEVEL SECURITY;

-- conversations / messages ────────────────────────────────────────────────
-- Participants only, both directions. Writes go through send_message() so
-- the preview and the offer-supersede rule cannot be bypassed, but SELECT
-- must be a policy because Realtime reads through RLS.
DROP POLICY IF EXISTS conv_participant_read ON conversations;
CREATE POLICY conv_participant_read ON conversations
  FOR SELECT USING (
    customer_id = auth.uid()
    OR technician_id IN (SELECT id FROM technician_profiles WHERE user_id = auth.uid())
    OR is_admin()
  );

DROP POLICY IF EXISTS msg_participant_read ON messages;
CREATE POLICY msg_participant_read ON messages
  FOR SELECT USING (in_conversation(conversation_id) OR is_admin());

-- push_subscriptions ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS push_own_all ON push_subscriptions;
CREATE POLICY push_own_all ON push_subscriptions
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- A karigar must be able to see their own strikes — a penalty you cannot
-- read is not a warning, it is just a mystery.
DROP POLICY IF EXISTS strikes_own_read ON technician_strikes;
CREATE POLICY strikes_own_read ON technician_strikes
  FOR SELECT USING (
    technician_id IN (SELECT id FROM technician_profiles WHERE user_id = auth.uid())
    OR is_admin()
  );

-- Blocked identities are admin-only; writes happen inside issue_strike().
DROP POLICY IF EXISTS blocked_admin_read ON blocked_identities;
CREATE POLICY blocked_admin_read ON blocked_identities
  FOR SELECT USING (is_admin());

-- A karigar needs to read the job rows assigned to them, including after
-- they leave the open board.
DROP POLICY IF EXISTS requests_assigned_read ON service_requests;
CREATE POLICY requests_assigned_read ON service_requests
  FOR SELECT USING (
    assigned_technician_id IN (SELECT id FROM technician_profiles WHERE user_id = auth.uid())
  );

ALTER TABLE contact_reveals ENABLE ROW LEVEL SECURITY;

-- A karigar sees what they were charged for; a customer sees what they
-- revealed. Writes happen only inside reveal_contact().
DROP POLICY IF EXISTS reveals_own_read ON contact_reveals;
CREATE POLICY reveals_own_read ON contact_reveals
  FOR SELECT USING (
    customer_id = auth.uid()
    OR technician_id IN (SELECT id FROM technician_profiles WHERE user_id = auth.uid())
    OR is_admin()
  );

DROP POLICY IF EXISTS txn_own_read ON wallet_transactions;
CREATE POLICY txn_own_read ON wallet_transactions
  FOR SELECT USING (
    technician_id IN (SELECT id FROM technician_profiles WHERE user_id = auth.uid())
    OR is_admin()
  );

-- ───────────────────────────────────────────────────────── 7. STORAGE ──
-- Voice notes. Customers upload; anyone signed in can play back, because a
-- technician has to hear the problem before deciding to buy the lead.

INSERT INTO storage.buckets (id, name, public)
VALUES ('voice-notes', 'voice-notes', TRUE)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS voice_notes_read ON storage.objects;
CREATE POLICY voice_notes_read ON storage.objects
  FOR SELECT USING (bucket_id = 'voice-notes');

DROP POLICY IF EXISTS voice_notes_insert ON storage.objects;
CREATE POLICY voice_notes_insert ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'voice-notes' AND auth.uid() IS NOT NULL);

-- Chat media: photos, videos and voice notes sent inside a thread.
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-media', 'chat-media', TRUE)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS chat_media_read ON storage.objects;
CREATE POLICY chat_media_read ON storage.objects
  FOR SELECT USING (bucket_id = 'chat-media');

DROP POLICY IF EXISTS chat_media_insert ON storage.objects;
CREATE POLICY chat_media_insert ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'chat-media' AND auth.uid() IS NOT NULL);

-- ─────────────────────────────────────────────────────── 9. REALTIME ──
-- Messages must broadcast for the thread to update live. Realtime reads
-- through RLS, so msg_participant_read is what keeps threads private.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ────────────────────────────────────────────────────────────── 8. NOTE ──
-- To make yourself an admin so /admin-config unlocks, sign in once through
-- the app, then run:
--   UPDATE profiles SET user_role = 'admin' WHERE phone_number = '03001234567';
