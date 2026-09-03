/**
 * Fixed reference data for the D.I. Khan pilot.
 *
 * Areas are the ones people actually name when you ask "aap kahan hain?" —
 * a mix of bazaars, roads and colonies. Keep this list short; a dropdown
 * with sixty entries is worse than one with fifteen.
 */
export const AREAS = [
  'Topanwala',
  'Circular Road',
  'Rahim Bazaar',
  'Cantt',
  'Bannu Road',
  'Muryali',
  'Kotla Saidan',
  'Gomal University Road',
  'Chungi No. 6',
  'Bilot Road',
  'Hospital Road',
  'Islamia Road',
  'Dera Town',
  'Parova',
]

/**
 * The eight launch categories.
 *
 * `name_roman` is the primary label in the UI — it is what a D.I. Khan
 * customer says out loud. `name_en` is the small caps line underneath, and
 * `name_ur` is set in Nastaliq as the watermark behind each tile.
 * `icon_name` matches the seeded `categories.icon_name` column.
 */
export const CATEGORIES = [
  { icon_name: 'ac',        name_roman: 'AC Ki Marammat',  name_en: 'AC Repair',        name_ur: 'اے سی کی مرمت', sort_order: 1 },
  { icon_name: 'electric',  name_roman: 'Bijli Ka Kaam',   name_en: 'Electrician',      name_ur: 'بجلی کا کام',   sort_order: 2 },
  { icon_name: 'plumb',     name_roman: 'Nal Ka Kaam',     name_en: 'Plumber',          name_ur: 'نل کا کام',     sort_order: 3 },
  { icon_name: 'carpenter', name_roman: 'Lakri Ka Kaam',   name_en: 'Carpenter',        name_ur: 'لکڑی کا کام',   sort_order: 4 },
  { icon_name: 'generator', name_roman: 'Generator Kaam',  name_en: 'Generator Tech',   name_ur: 'جنریٹر مرمت',   sort_order: 5 },
  { icon_name: 'appliance', name_roman: 'Gharelu Saman',   name_en: 'Appliance Repair', name_ur: 'گھریلو سامان',  sort_order: 6 },
  { icon_name: 'painter',   name_roman: 'Rang o Roghan',   name_en: 'Painter',          name_ur: 'رنگ و روغن',    sort_order: 7 },
  { icon_name: 'auto',      name_roman: 'Gari Mistri',     name_en: 'Auto Mechanic',    name_ur: 'گاڑی مستری',    sort_order: 8 },
]

/** Tile colour per category. Royal blue is the default; amber marks the two
 *  categories that drive emergency call volume in summer (AC, generator). */
export const CATEGORY_TONE = {
  ac: 'amber',
  generator: 'amber',
}

export const MAX_VOICE_NOTE_SECONDS = 30

/** Set when someone taps "Browse karigars without an account", so the
 *  onboarding screen stops intercepting them for the rest of the visit. */
export const BROWSE_KEY = 'karigar.browsing'

export const CONFIG_DEFAULTS = {
  monetization_active: false,
  lead_unlock_cost: 30,
  free_leads_allowance: 5,
  support_whatsapp: '923000000000',
  // Commission runs independently of the lead fee — either, both, or neither.
  commission_active: false,
  commission_percent: 10,
  discrepancy_tolerance_percent: 20,
  max_unconfirmed_jobs: 2,
  confirmation_timeout_days: 7,
  strike1_freeze_hours: 24,
  strike2_fine: 500,
  strike2_suspend_days: 7,
  // Directory contact reveals. Must be listed here as well as in the SQL
  // seed — the demo backend reads only this object, so a key missing here
  // silently disables the feature on that backend.
  directory_charge_active: true,
  directory_contact_cost: 50,
  contact_dedupe_days: 7,
}

/** Why the lead centre is locked, in words a karigar can act on. */
export const BLOCK_REASONS = {
  BANNED: {
    title: 'Aap ka account band hai',
    body: 'Support se raabta karein.',
  },
  FROZEN: {
    title: 'Lead access rok diya gaya hai',
    body: 'Strike ki wajah se. Neeche waqt dekhein.',
  },
  NEGATIVE_BALANCE: {
    title: 'Wallet mein baqaya hai',
    body: 'Pehle baqaya jama karein, phir nayi leads mil jayengi.',
  },
  TOO_MANY_UNCONFIRMED: {
    title: 'Pehle purane kaam ka status daalein',
    body: 'Jo kaam mukammal ho gaya hai, usay "Kaam mukammal" mark karein.',
  },
}
