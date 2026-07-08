#!/usr/bin/env node
// Generate placeholder PWA icons into public/icons/ using sharp.
// Regenerate with: node scripts/generate-pwa-icons.mjs
// Replace the emitted PNGs with real brand assets whenever available;
// keep the same filenames so app/manifest.ts stays in sync.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'icons');

const BG = '#0a0a0a';
const FG = '#ffffff';
const MONOGRAM = 'FL';

// `safe` is the fraction of the canvas kept clear of the safe-zone edge,
// so maskable icons survive the circular/rounded crop applied by the OS.
function svg({ size, radius, fontScale, pad }) {
  const font = Math.round(size * fontScale);
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect x="${pad}" y="${pad}" width="${size - pad * 2}" height="${size - pad * 2}" rx="${radius}" ry="${radius}" fill="${BG}"/>
  <text x="50%" y="50%" dy="0.02em" text-anchor="middle" dominant-baseline="central"
    font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    font-weight="700" font-size="${font}" fill="${FG}" letter-spacing="${size * 0.005}">${MONOGRAM}</text>
</svg>`,
  );
}

// [filename, size, cornerRadiusFraction, fontFraction, padFraction]
const targets = [
  ['icon-192.png', 192, 0.22, 0.42, 0],
  ['icon-512.png', 512, 0.22, 0.42, 0],
  // maskable: extra padding so the monogram stays inside the safe zone.
  ['icon-maskable-512.png', 512, 0.5, 0.34, 0.1],
  ['apple-touch-icon.png', 180, 0.001, 0.42, 0], // iOS applies its own mask
  ['favicon-32.png', 32, 0.18, 0.5, 0],
];

await mkdir(outDir, { recursive: true });

for (const [name, size, rFrac, fFrac, pFrac] of targets) {
  const pad = Math.round(size * pFrac);
  const inner = size - pad * 2;
  const png = await sharp(
    svg({
      size,
      radius: Math.round(inner * rFrac),
      fontScale: fFrac,
      pad,
    }),
  )
    .png()
    .toBuffer();
  await writeFile(join(outDir, name), png);
  console.log(`generated public/icons/${name} (${size}x${size})`);
}

console.log('PWA icons generated.');
