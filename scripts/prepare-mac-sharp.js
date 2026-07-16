#!/usr/bin/env node
/*
 * Ensures BOTH macOS sharp native binaries (arm64 + x64) are present in
 * node_modules, regardless of the host architecture.
 *
 * Why: npm only installs the optional @img/sharp-* package that matches the
 * current CPU. So on an Apple Silicon machine the x64 binary is missing, and an
 * Intel build would bundle the wrong architecture -> the app fails to open on
 * Intel Macs. This script fetches whatever is missing (npm pack ignores the
 * platform check) and extracts it into node_modules/@img.
 *
 * Runs automatically via the "postinstall" npm hook. Safe to run repeatedly.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const IMG_DIR = path.join(ROOT, 'node_modules', '@img');

function log(msg) { console.log(`  • prepare-mac-sharp: ${msg}`); }

// Serve solo a chi compila le due app macOS da un unico Mac. Su Windows/Linux
// scaricherebbe libvips per macOS, che electron-builder impacchetterebbe
// nell'AppImage e nell'installer: decine di MB di binari inutilizzabili.
if (process.platform !== 'darwin') {
  log('host non macOS: niente da preparare.');
  process.exit(0);
}

try {
  const sharpPkg = require(path.join(ROOT, 'node_modules', 'sharp', 'package.json'));
  const optional = sharpPkg.optionalDependencies || {};

  // the four mac packages we want present (both arches)
  const wanted = [
    '@img/sharp-darwin-arm64',
    '@img/sharp-darwin-x64',
    '@img/sharp-libvips-darwin-arm64',
    '@img/sharp-libvips-darwin-x64'
  ].filter((name) => optional[name]); // only those sharp actually declares

  const missing = wanted.filter((name) => {
    const dir = path.join(IMG_DIR, name.replace('@img/', ''));
    return !fs.existsSync(dir);
  });

  if (missing.length === 0) {
    log('binari macOS arm64 + x64 già presenti, niente da fare.');
    process.exit(0);
  }

  fs.mkdirSync(IMG_DIR, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aurora-sharp-'));

  for (const name of missing) {
    const version = optional[name];
    const spec = `${name}@${version}`;
    log(`scarico ${spec} …`);
    // npm pack fetches the tarball ignoring os/cpu checks
    const out = execFileSync('npm', ['pack', spec, '--silent'], { cwd: tmp, encoding: 'utf8' });
    const tgz = out.trim().split('\n').pop();
    const dest = path.join(IMG_DIR, name.replace('@img/', ''));
    fs.mkdirSync(dest, { recursive: true });
    execFileSync('tar', ['-xzf', path.join(tmp, tgz), '--strip-components=1', '-C', dest]);
    log(`installato ${name}`);
  }

  fs.rmSync(tmp, { recursive: true, force: true });
  log('completato: build cross-architettura pronta.');
} catch (e) {
  // Never fail the whole install because of this; just warn.
  log(`ATTENZIONE, impossibile preparare i binari cross-arch: ${e.message}`);
  log('La build per l\'altra architettura potrebbe non funzionare finché non li aggiungi.');
  process.exit(0);
}
