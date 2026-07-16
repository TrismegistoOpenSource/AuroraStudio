/*
 * Hook beforePack di electron-builder.
 *
 * Perché esiste: gli extraResources copiano LICENSE e LICENSES.chromium.html
 * da node_modules/electron/dist dentro l'app, ma quella cartella esiste solo
 * se il postinstall di electron ha scaricato il binario — e non è garantito
 * (electron-builder si scarica una copia propria e non la lascia lì). Quando
 * il "from" di un extraResource non esiste, electron-builder LO SALTA IN
 * SILENZIO: build verde, app distribuita senza le licenze di Electron e
 * Chromium. Questo hook chiude il buco facendo popolare dist/ dall'installer
 * ufficiale del pacchetto electron prima dell'impacchettamento.
 */
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

exports.default = async function ensureElectronDist() {
  const root = path.resolve(__dirname, '..')
  const pkg = path.join(root, 'node_modules', 'electron')
  const marker = path.join(pkg, 'dist', 'LICENSE')
  if (fs.existsSync(marker)) return

  console.log('  • electron/dist assente: lo scarico con l\'installer del pacchetto electron')
  execFileSync(process.execPath, [path.join(pkg, 'install.js')], {
    stdio: 'inherit',
    cwd: pkg
  })
  if (!fs.existsSync(marker)) {
    throw new Error('electron/dist/LICENSE ancora assente dopo install.js: ' +
      'le licenze di Electron/Chromium non finirebbero nell\'app')
  }
}
