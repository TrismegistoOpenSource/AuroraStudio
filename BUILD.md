# Aurora Studio — Guida alla compilazione

App desktop Electron **in TypeScript** per l'elaborazione batch di immagini
(Batch, Image→PDF, Combiner, Renamer, Pulizia Metadati, Password→PDF), UI in stile
Gemini con tema chiaro/scuro.

---

## Requisiti

- **Node.js 18+** e npm
- Solo per rigenerare l'icona: **Xcode Command Line Tools** (fornisce `iconutil`)

## Setup (una volta)

```bash
npm install
```

> Il `postinstall` esegue automaticamente `scripts/prepare-mac-sharp.js`, che
> garantisce la presenza dei binari nativi di **sharp per ENTRAMBE le architetture
> macOS (arm64 + x64)**. Serve perché npm installa solo il binario dell'architettura
> corrente: senza questo passo, compilando su Apple Silicon la build **Intel**
> conterrebbe il binario sbagliato e non si aprirebbe.

## Sviluppo

```bash
npm start          # compila il TypeScript e avvia l'app
npm run compile    # solo compilazione TS -> JS
```

## Compilazione (output in `../build/`)

> **Nella maggior parte dei casi non serve compilare a mano.** Le release sono
> prodotte da [GitHub Actions](.github/workflows/build.yml) su runner nativi per
> ogni piattaforma: basta spingere un tag `v*`. Questa guida serve per compilare
> in locale, dove i binari nativi vanno sistemati a mano.

### Pubblicare una nuova versione

1. Aggiorna la versione in `package.json` e rinomina la cartella del progetto
   (`AuroraStudio_1.0` → `AuroraStudio_1.1`, schema del workspace).
2. Commit e push su `main`; controlla che la CI sia verde.
3. Spingi il tag:
   ```sh
   git tag v1.1.0 && git push origin v1.1.0
   ```
   La CI ricompila su tutti gli OS, **verifica gli artefatti** (monta i dmg,
   controlla architettura, bundle id, ffmpeg, sharp e licenze impacchettate) e
   pubblica tutto nella pagina [Release](https://github.com/TrismegistoOpenSource/AuroraStudio/releases).
   Nessun passo manuale.

| Comando | Output |
|---|---|
| `npm run build:mac`       | **Apple Silicon + Intel** (due `.dmg`) |
| `npm run build:mac-arm`   | solo Apple Silicon (`AuroraStudio-AppleSilicon-…-arm64.dmg`) |
| `npm run build:mac-intel` | solo Intel (`AuroraStudio-Intel-…dmg`) |
| `npm run build:win`       | Windows installer (`.exe`, NSIS, x64) |
| `npm run build:linux`     | Linux (`.AppImage`) |

Ogni comando **compila prima il TypeScript** e poi impacchetta. Gli artefatti
finiscono in **`../build/`**, cioè in `AuroraStudio_1.0/build/`, fuori dal
sorgente.

Le due app macOS hanno architettura pura, nome e bundle id distinti
(`com.aurorastudio.app.arm64` / `.intel`): con id identici macOS le tratta come
la stessa app e ne risolve una sola. La cartella dei dati utente resta comunque
una sola per entrambe, fissata da `app.setName('AuroraStudio')` in `main.ts`.

**➡️ "Compilami la versione X":** esegui `npm install` (se manca `node_modules`) e
poi il comando corrispondente qui sopra. Nient'altro.

---

## Note tecniche / punti critici

- **TypeScript** — sorgenti: `main.ts`, `preload.ts`, `renderer.ts`, `global.d.ts`.
  I `.js` compilati vengono generati in root (git-ignored) dallo step `compile`.
- **sharp cross-arch** — gestito da `scripts/prepare-mac-sharp.js` (hook `postinstall`).
  Se una build fallisse per architettura sbagliata: `node scripts/prepare-mac-sharp.js`.
  Lo script si autoesclude sugli host non-macOS: là scaricherebbe libvips per
  macOS, che electron-builder impacchetterebbe nell'AppImage e nell'installer.
  In CI non entra mai in gioco: ogni runner compila la propria architettura.
- **ffmpeg (Pulizia Metadati → video)** — `scripts/prepare-ffmpeg.js` (hook `postinstall`)
  scarica i binari ffmpeg per **tutte le piattaforme** (darwin-arm64/x64, win32-x64,
  linux-x64) dalla stessa release di `ffmpeg-static`, in `resources/ffmpeg/<platform>-<arch>/`.
  In `package.json` ogni target ha un `extraResources` che copia SOLO la cartella
  giusta (`mac` usa il macro `${arch}`) in `Resources/ffmpeg/`. A runtime (`main.ts`
  `resolveFfmpegPath`) l'app usa `process.resourcesPath/ffmpeg/ffmpeg[.exe]` da
  impacchettata, o i binari in `resources/` / `ffmpeg-static` in sviluppo. Così la
  pulizia video funziona su tutti gli OS. Se offline durante l'install, i video di
  altre piattaforme non verranno impacchettati: rilancia `node scripts/prepare-ffmpeg.js`.
  **Lo script non fa fallire `npm install` di proposito**: una build può quindi
  uscire senza ffmpeg e rompersi solo a runtime. Per questo la CI verifica che il
  binario ci sia *prima* di compilare, e fallisce se manca.
- **sharp cross-platform (win/linux)** — oltre alle due arch mac, per i build Windows e
  Linux servono i binari `@img/sharp-win32-x64` e `@img/sharp-linux-x64` (+libvips) in
  `node_modules/@img`. Vanno estratti a mano come per SmartView (`npm pack` + `tar`),
  perché `prepare-mac-sharp.js` prepara solo le arch macOS. In CI il problema non
  si pone: ogni runner è nativo e `npm ci` installa da sé il binario giusto.
- **Slim per-arch** — `afterPack.js` rimuove da ogni app il binario sharp dell'altra
  architettura, così i `.dmg` restano leggeri.
- **Firma** — ad-hoc (`mac.identity: "-"`, `mac.hardenedRuntime: false`). L'app **non è
  notarizzata** (nessun Apple Developer ID).
- **Quarantena sul Mac di destinazione** — essendo non firmata con ID Apple, al primo
  avvio macOS può bloccarla ("Impossibile aprire l'applicazione"). Fix:
  ```bash
  xattr -dr com.apple.quarantine /Applications/AuroraStudio-AppleSilicon.app   # o -Intel
  ```
  (oppure click destro sull'app → **Apri**).
- **Icona** — `icons/icon.icns` è già pronta. Per rigenerarla dall'immagine
  `icons/icon-source.jpg`: `node icons/make-icon.js`.
