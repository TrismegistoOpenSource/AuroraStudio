#!/usr/bin/env node
/*
 * Regenerates icons/icon.icns and icons/icon.png from icons/icon-source.jpg
 * (the aurora image), masked into a rounded macOS tile.
 *
 * Requires: sharp (project dependency) + `iconutil` (macOS, for the .icns).
 * Run:  node icons/make-icon.js
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const BUILD = __dirname;
const SRC = path.join(BUILD, 'icon-source.jpg');
const ISET = path.join(BUILD, 'icon.iconset');

(async () => {
  const img = await sharp(SRC).resize(936, 936, { fit: 'cover' }).png().toBuffer();
  const placed = await sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: img, left: 44, top: 44 }]).png().toBuffer();
  const mask = await sharp(Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect x="44" y="44" width="936" height="936" rx="208" fill="#fff"/></svg>`
  )).png().toBuffer();
  const rounded = await sharp(placed).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();

  fs.mkdirSync(ISET, { recursive: true });
  const sizes = {
    16: ['icon_16x16.png'], 32: ['icon_16x16@2x.png', 'icon_32x32.png'], 64: ['icon_32x32@2x.png'],
    128: ['icon_128x128.png'], 256: ['icon_128x128@2x.png', 'icon_256x256.png'],
    512: ['icon_256x256@2x.png', 'icon_512x512.png'], 1024: ['icon_512x512@2x.png']
  };
  for (const [size, names] of Object.entries(sizes)) {
    const png = await sharp(rounded).resize(Number(size), Number(size)).png().toBuffer();
    for (const n of names) fs.writeFileSync(path.join(ISET, n), png);
  }
  fs.writeFileSync(path.join(BUILD, 'icon.png'), await sharp(rounded).resize(512, 512).png().toBuffer());
  try {
    execFileSync('iconutil', ['-c', 'icns', ISET, '-o', path.join(BUILD, 'icon.icns')]);
    console.log('icon.icns + icon.png rigenerati');
  } catch (e) {
    console.log('icon.png rigenerato; iconutil non disponibile per .icns:', e.message);
  }
  fs.rmSync(ISET, { recursive: true, force: true });
})();
