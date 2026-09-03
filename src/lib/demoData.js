import { AREAS, CATEGORIES } from './constants'

/**
 * Seed content for the demo backend, so a fresh install has something to
 * show before a single real karigar has signed up. Names, shops and areas
 * are plausible for D.I. Khan but entirely fictional, and every phone
 * number is a reserved 0300-000xxxx placeholder that dials nowhere.
 */

const T = (
  full_name, shop_name, cat, address_area, experience_years, rating, is_verified, phone,
) => ({
  full_name,
  shop_name,
  icon_name: cat,
  address_area,
  experience_years,
  rating,
  is_verified,
  is_available: true,
  phone_number: phone,
  whatsapp_number: phone,
  wallet_balance: 0,
})

export const DEMO_TECHNICIANS = [
  T('Muhammad Ashraf',  'Ashraf Cooling Centre',   'ac',        'Circular Road',         14, 4.9, true,  '03000001001'),
  T('Gul Rehman',       'Gul Electric Works',      'electric',  'Topanwala',             9,  4.8, true,  '03000001002'),
  T('Abdul Sattar',     'Sattar Sanitary Store',   'plumb',     'Rahim Bazaar',          11, 4.6, true,  '03000001003'),
  T('Naseer Ullah',     'Naseer Furniture House',  'carpenter', 'Muryali',               17, 4.7, true,  '03000001004'),
  T('Imran Khan Marwat','Marwat Generator Service','generator', 'Bannu Road',            7,  4.9, true,  '03000001005'),
  T('Shahid Iqbal',     'Iqbal Home Appliances',   'appliance', 'Cantt',                 6,  4.5, false, '03000001006'),
  T('Zahid Hussain',    'Hussain Paint House',     'painter',   'Kotla Saidan',          12, 4.4, true,  '03000001007'),
  T('Rafiq Ahmed',      'Rafiq Auto Workshop',     'auto',      'Chungi No. 6',          20, 4.8, true,  '03000001008'),
  T('Waqar Younis',     'Cool Point AC Service',   'ac',        'Gomal University Road', 5,  4.6, true,  '03000001009'),
  T('Sanaullah Khan',   'Sana Electric & Wiring',  'electric',  'Hospital Road',         8,  4.7, true,  '03000001010'),
  T('Farhan Ali',       'Ali Plumbing Solutions',  'plumb',     'Islamia Road',          4,  4.3, false, '03000001011'),
  T('Habib ur Rehman',  'Habib Generator Point',   'generator', 'Dera Town',             10, 4.8, true,  '03000001012'),
]

const DEMO_JOB_SEEDS = [
  {
    title: 'Split AC not cooling, only fan running',
    description: 'Gas leak lag raha hai. Outdoor unit chal raha hai lekin thanda nahi ho raha. Dopehar mein aa jayen.',
    icon_name: 'ac',
    area_location: 'Topanwala',
    proposed_budget: 2500,
    minutesAgo: 12,
  },
  {
    title: 'Main switchboard sparking',
    description: 'Kitchen ka switchboard spark kar raha hai aur breaker baar baar trip ho raha hai. Urgent hai.',
    icon_name: 'electric',
    area_location: 'Circular Road',
    proposed_budget: 1200,
    minutesAgo: 41,
  },
  {
    title: 'Motor not pulling water to roof tank',
    description: 'Naya motor lagwaya tha 6 mahine pehle. Ab paani upar nahi charh raha.',
    icon_name: 'plumb',
    area_location: 'Rahim Bazaar',
    proposed_budget: 1800,
    minutesAgo: 96,
  },
  {
    title: 'Generator auto-start not working',
    description: '5 KVA generator hai. Load shedding mein khud start nahi hota, manual karna parta hai.',
    icon_name: 'generator',
    area_location: 'Cantt',
    proposed_budget: 3000,
    minutesAgo: 150,
  },
  {
    title: 'Two door frames need repair',
    description: 'Bedroom ke do darwazon ke frame kharab ho gaye hain, band nahi hotay theek se.',
    icon_name: 'carpenter',
    area_location: 'Muryali',
    proposed_budget: 4500,
    minutesAgo: 320,
  },
  {
    title: 'Washing machine drum making noise',
    description: 'Spin ke waqt bohat awaz aati hai aur machine hilti hai.',
    icon_name: 'appliance',
    area_location: 'Bannu Road',
    proposed_budget: 1500,
    minutesAgo: 500,
  },
]

/** Builds the seeded rows, wiring up ids and the category foreign keys. */
export function buildDemoSeed() {
  const now = Date.now()

  const categories = CATEGORIES.map((c) => ({
    id: `cat-${c.icon_name}`,
    name_en: c.name_en,
    name_ur: c.name_ur,
    name_roman: c.name_roman,
    icon_name: c.icon_name,
    is_active: true,
    sort_order: c.sort_order,
  }))

  const profiles = []
  const technician_profiles = []

  DEMO_TECHNICIANS.forEach((t, i) => {
    const userId = `demo-user-${i + 1}`
    profiles.push({
      id: userId,
      full_name: t.full_name,
      phone_number: t.phone_number,
      user_role: 'technician',
      avatar_url: null,
      created_at: new Date(now - 86400000 * (30 - i)).toISOString(),
    })
    technician_profiles.push({
      id: `demo-tech-${i + 1}`,
      user_id: userId,
      category_id: `cat-${t.icon_name}`,
      shop_name: t.shop_name,
      address_area: t.address_area,
      experience_years: t.experience_years,
      cnic_number: null,
      is_verified: t.is_verified,
      wallet_balance: 0,
      rating: t.rating,
      is_available: true,
      whatsapp_number: t.whatsapp_number,
      created_at: new Date(now - 86400000 * (30 - i)).toISOString(),
    })
  })

  // Six fictional customers so the lead board is not empty on first run.
  const service_requests = DEMO_JOB_SEEDS.map((j, i) => {
    const customerId = `demo-cust-${i + 1}`
    profiles.push({
      id: customerId,
      full_name: ['Bilal Ahmad', 'Saira Bibi', 'Kamran Shah', 'Nadia Yousaf', 'Tariq Mehmood', 'Asma Khan'][i],
      phone_number: `0300000200${i + 1}`,
      user_role: 'customer',
      avatar_url: null,
      created_at: new Date(now - 86400000).toISOString(),
    })
    return {
      id: `demo-req-${i + 1}`,
      customer_id: customerId,
      category_id: `cat-${j.icon_name}`,
      title: j.title,
      description: j.description,
      audio_note_url: null,
      area_location: j.area_location,
      proposed_budget: j.proposed_budget,
      status: 'open',
      created_at: new Date(now - j.minutesAgo * 60000).toISOString(),
    }
  })

  return { categories, profiles, technician_profiles, service_requests }
}
