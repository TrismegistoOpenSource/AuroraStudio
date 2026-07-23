#!/usr/bin/env node
/*
 * Rigenera icons/icon.icns e icons/icon.png: sfondo squircle e gradiente
 * ciano→indigo identici a RsyncGUI/Encryptor/SmartView (palette unificata
 * tra le app Trismegisto), con il glifo "Aloni" (archi concentrici, come
 * un'aurora vista di fronte) al posto della vecchia foto ritagliata.
 *
 * Requires: sharp (project dependency) + `iconutil` (macOS, per l'.icns).
 * Run:  node icons/make-icon.js
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const BUILD = __dirname;
const ISET = path.join(BUILD, 'icon.iconset');
const S = 1024;

function iconSvg() {
  const cx = S / 2;
  const ccyAppKit = S * 0.30;
  const ccySvg = S - ccyAppKit;
  const lw = S * 0.052;
  const startDeg = 25, endDeg = 155;
  const startRad = (startDeg * Math.PI) / 180;
  const cosA = Math.cos(startRad), sinA = Math.sin(startRad);

  const rings = [S * 0.14, S * 0.20, S * 0.26].map((r, i) => {
    const x1 = cx + r * cosA, x2 = cx - r * cosA;
    const y = ccySvg - r * sinA;
    const width = lw * (1 - i * 0.12);
    return `<path d="M ${x1} ${y} A ${r} ${r} 0 0 0 ${x2} ${y}" fill="none" stroke="url(#logo)" stroke-width="${width}" stroke-linecap="round"/>`;
  }).join('\n    ');

  return `<svg width="${S}" height="${S}" viewBox="0 0 ${S} ${S}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="#131620"/>
      <stop offset="1" stop-color="#202433"/>
    </linearGradient>
    <linearGradient id="logo" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#4fd1ff"/>
      <stop offset="1" stop-color="#5b6cff"/>
    </linearGradient>
  </defs>
  <rect x="20" y="20" width="${S - 40}" height="${S - 40}" rx="220" ry="220" fill="url(#bg)"/>
  <rect x="23" y="23" width="${S - 46}" height="${S - 46}" rx="217" ry="217"
        fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="6"/>
  ${rings}
</svg>`;
}

(async () => {
  const rounded = await sharp(Buffer.from(iconSvg())).png().toBuffer();

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
