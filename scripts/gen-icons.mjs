import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

/**
 * Rasterises the PWA icons from inline SVG so there are no binary assets to
 * keep in sync. Run with `npm run icons` after changing the mark.
 *
 * Maskable variant keeps the mark inside the safe zone (80% of the canvas),
 * because Android crops icons to whatever shape the launcher uses.
 */

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons')

const mark = (scale = 1, pad = 0) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#1E3A8A"/>
  <g transform="translate(${pad}, ${pad}) scale(${scale})">
    <rect x="0" y="96" width="512" height="26" fill="#F59E0B" opacity="0.9"/>
    <path d="M320 192a64 64 0 0 0-83.2 87.2l-68.8 68.8a28.8 28.8 0 0 0 40.8 40.8l68.8-68.8A64 64 0 0 0 364.8 236.8l-35.2 35.2-36.8-9.6-9.6-36.8z" fill="#ffffff"/>
    <path d="M248 136l-48 80h40l-16 64 64-88h-40z" fill="#F59E0B"/>
  </g>
</svg>`

async function main() {
  await mkdir(OUT, { recursive: true })

  const full = Buffer.from(mark(1, 0))
  // 0.78 scale centred leaves the ~10% margin a maskable icon needs.
  const safe = Buffer.from(mark(0.78, 56))

  await Promise.all([
    sharp(full).resize(192, 192).png().toFile(resolve(OUT, 'icon-192.png')),
    sharp(full).resize(512, 512).png().toFile(resolve(OUT, 'icon-512.png')),
    sharp(safe).resize(512, 512).png().toFile(resolve(OUT, 'maskable-512.png')),
  ])

  await writeFile(resolve(OUT, 'icon.svg'), mark(1, 0).trim())
  console.log('Wrote icon-192.png, icon-512.png, maskable-512.png and icon.svg')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
