import { maskPhoneNumbers } from '../src/lib/format.js'

/**
 * Checks the phone-masking rule against the things people actually type.
 * Run with `node scripts/test-mask.mjs`.
 *
 * The false positives matter as much as the leaks: mangling "1000-2000" in
 * a budget line would be a worse bug than the leak it is guarding against.
 */
const CASES = [
  // [input, shouldMask]
  ['Kitchen ka switchboard spark kar raha hai. 0300 1234567 par call karein', true],
  ['Call me at 03001234567', true],
  ['+92 300 1234567 par raabta karein', true],
  ['0092-300-1234567', true],
  ['Mera number 0300-123-4567 hai', true],
  ['Landline 0966 123456 par baat karein', true],
  ['۰۳۰۰ ۱۲۳۴۵۶۷ par call karein', true], // Urdu digits
  ['whatsapp 3001234567', true],

  // Must survive untouched
  ['Budget 1000 se 2000 tak', false],
  ['Rate 1000-2000 ke darmiyan', false],
  ['5 KVA generator hai', false],
  ['6 mahine pehle naya motor lagwaya tha', false],
  ['2 darwazon ke frame kharab hain', false],
  ['AC 1.5 ton hai, 2018 model', false],
  ['Sector 11 street 22 house 33', false],
  ['PKR 2500 de sakta hoon', false],
  ['Do din se paani nahi aa raha', false],
]

let failed = 0

for (const [input, shouldMask] of CASES) {
  const { text, found } = maskPhoneNumbers(input)
  const ok = found === shouldMask
  if (!ok) failed++
  console.log(
    `${ok ? 'pass' : 'FAIL'}  ${shouldMask ? 'mask  ' : 'keep  '} ${JSON.stringify(input)}`,
  )
  if (!ok || found) console.log(`        → ${JSON.stringify(text)}`)
}

console.log(`\n${CASES.length - failed}/${CASES.length} passed`)
process.exit(failed ? 1 : 0)
