#!/usr/bin/env node
/*
 * Scarica i binari di ffmpeg per TUTTE le piattaforme di distribuzione e li
 * mette in resources/ffmpeg/<platform>-<arch>/ffmpeg[.exe].
 *
 * Perché: il tool "Pulizia Metadati" usa ffmpeg per i video, ma il pacchetto
 * npm `ffmpeg-static` scarica solo il binario dell'host. Per impacchettare la
 * funzione video su Windows / Linux / Mac Intel servono anche i loro binari.
 * electron-builder poi include, per ogni build, solo la cartella che corrisponde
 * a `${platform}-${arch}` (vedi extraResources in package.json).
 *
 * I binari vengono dalla stessa GitHub release usata da ffmpeg-static.
 * Idempotente: salta i binari già presenti. Non fa fallire l'install se offline.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const zlib = require('zlib');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'resources', 'ffmpeg');

// Tag della release binaria, letto dal package.json di ffmpeg-static.
let releaseTag = 'b6.1.1';
try {
  const ff = require(path.join(ROOT, 'node_modules', 'ffmpeg-static', 'package.json'));
  releaseTag = ff['ffmpeg-static']['binary-release-tag'] || releaseTag;
} catch (e) { /* usa il default */ }

const BASE = `https://github.com/eugeneware/ffmpeg-static/releases/download/${releaseTag}`;

// piattaforme di distribuzione: [platform, arch]
const TARGETS = [
  ['darwin', 'arm64'],
  ['darwin', 'x64'],
  ['win32', 'x64'],
  ['linux', 'x64']
];

function log(msg) { console.log(`  • prepare-ffmpeg: ${msg}`); }

function binName(platform) { return platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'; }

// Se il binario dell'host è già stato scaricato da ffmpeg-static, riusalo.
function localHostBinary() {
  try {
    const p = require(path.join(ROOT, 'node_modules', 'ffmpeg-static'));
    return p && fs.existsSync(p) ? p : null;
  } catch (e) { return null; }
}

try {
  fs.mkdirSync(OUT, { recursive: true });
  const hostPlatform = os.platform();
  const hostArch = os.arch();
  const hostBin = localHostBinary();

  for (const [platform, arch] of TARGETS) {
    const destDir = path.join(OUT, `${platform}-${arch}`);
    const destFile = path.join(destDir, binName(platform));
    if (fs.existsSync(destFile)) { log(`${platform}-${arch} già presente.`); continue; }
    fs.mkdirSync(destDir, { recursive: true });

    // Riusa il binario locale per l'host, evita un download.
    if (hostBin && platform === hostPlatform && arch === hostArch) {
      fs.copyFileSync(hostBin, destFile);
      fs.chmodSync(destFile, 0o755);
      log(`${platform}-${arch} copiato da ffmpeg-static.`);
      continue;
    }

    const url = `${BASE}/ffmpeg-${platform}-${arch}.gz`;
    const tmpGz = path.join(destDir, 'ffmpeg.gz');
    log(`scarico ${platform}-${arch} …`);
    execFileSync('curl', ['-fSL', '--retry', '3', '-o', tmpGz, url], { stdio: ['ignore', 'ignore', 'inherit'] });
    fs.writeFileSync(destFile, zlib.gunzipSync(fs.readFileSync(tmpGz)));
    fs.rmSync(tmpGz, { force: true });
    fs.chmodSync(destFile, 0o755);
    log(`installato ${platform}-${arch}.`);
  }
  log('completato: binari ffmpeg multipiattaforma pronti.');
} catch (e) {
  log(`ATTENZIONE, impossibile preparare i binari ffmpeg: ${e.message}`);
  log('La pulizia video potrebbe non funzionare su alcune piattaforme finché non li aggiungi.');
  process.exit(0);
}
