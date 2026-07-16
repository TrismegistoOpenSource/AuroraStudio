# Aurora Studio

App desktop (Electron + **TypeScript**) per l'elaborazione di immagini in batch,
con interfaccia pulita in stile Google **Gemini** e tema **chiaro/scuro** commutabile.

[![Build](https://github.com/TrismegistoOpenSource/AuroraStudio/actions/workflows/build.yml/badge.svg)](https://github.com/TrismegistoOpenSource/AuroraStudio/actions/workflows/build.yml)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)

## Download

Le build compilate sono nella pagina **[Release](https://github.com/TrismegistoOpenSource/AuroraStudio/releases)** — non serve installare nulla per compilare, si scarica e si usa.

| File | Piattaforma |
|---|---|
| `AuroraStudio-AppleSilicon-*.dmg` | macOS Apple Silicon (M1 e successivi) |
| `AuroraStudio-Intel-*.dmg` | macOS Intel |
| `AuroraStudio Setup *.exe` | Windows x64 |
| `AuroraStudio-*.AppImage` | Linux x64 (portabile) |

Su Windows, al primo avvio compare l'avviso SmartScreen: manca un certificato di
code-signing. Si passa da **Ulteriori informazioni → Esegui comunque**.

### macOS: sbloccare l'app al primo avvio

L'app **non è firmata con un Apple Developer ID**, quindi macOS la mette in
quarantena e al primo avvio dice che è danneggiata o che non può essere aperta.
Non è danneggiata: è la quarantena.

Trascina prima l'app in **Applicazioni**, poi incolla nel Terminale la riga che
corrisponde alla versione scaricata:

```bash
xattr -dr com.apple.quarantine /Applications/AuroraStudio-AppleSilicon.app
```

```bash
xattr -dr com.apple.quarantine /Applications/AuroraStudio-Intel.app
```

Va fatto una volta sola, e serve solo per le app scaricate da internet. In
alternativa: clic destro sull'app → **Apri** → di nuovo **Apri**.

> Questa sezione esiste unicamente perché manca una firma Apple riconosciuta
> (che richiede un account Developer a pagamento). Il giorno in cui il progetto
> ne avrà una e le build saranno notarizzate, la quarantena non scatterà più e
> queste istruzioni andranno rimosse.

## Funzioni

- **Batch** — ridimensiona / converte / ottimizza.
  Formati: **Originale, JPG, PNG, WEBP**.
  - PNG e WEBP: modalità **Lossless (deflate, non distruttivo)** o **Lossy (compresso/distruttivo)**.
  - **Originale**: mantiene il formato di ogni file; senza ridimensionamento **copia il file identico** (nessuna perdita).
  - Lo slider Qualità appare solo dove ha senso (JPG, oppure PNG/WEBP in Lossy).
  - Se imposti una dimensione, l'altra viene calcolata **automaticamente** dalle proporzioni.
- **Image → PDF** — unisce le immagini in un PDF (orientamento, margini, ottimizzazione).
- **Combiner** — affianca/impila le immagini in un'unica immagine continua, con split.
- **Renamer** — rinomina in blocco con **anteprima live** a doppio pannello.
- **Pulizia Metadati** — rimuove i dati privati (GPS, data/ora, dispositivo, autore,
  software, miniature) da **immagini, video e PDF**, salvando copie ripulite col
  suffisso `_clean` senza toccare gli originali.
  - Immagini: EXIF/GPS/XMP/IPTC via **sharp** (mantiene il profilo colore ICC).
  - Video: metadati globali e capitoli via **ffmpeg** in *stream copy* — **nessuna
    ricompressione**, qualità intatta.
  - PDF: Info dictionary + XMP via **pdf-lib**.
- **Password → PDF** — importa un export **Bitwarden** (JSON), raggruppa le voci per
  cartella (nome, URL, username, password, note) e genera un **PDF su due colonne**
  con scelta del font. Anteprima live in-app; PDF prodotto via `printToPDF` di Electron.
- **Canvas continua** — mantiene la lista file passando da un tool all'altro.

## Compilare dai sorgenti

Prerequisiti: **Node.js 18+** e npm. Vedi [`BUILD.md`](./BUILD.md) per i dettagli.

```bash
npm install
npm start          # compila il TypeScript e avvia l'app
```

**electron-builder compila per la piattaforma su cui gira**: ogni comando va
eseguito sul sistema operativo corrispondente. Gli artefatti escono in
`../build/`, fuori dal sorgente.

```bash
npm run build:mac       # entrambe le app macOS (arm64 + Intel)
npm run build:mac-arm   # solo Apple Silicon
npm run build:mac-intel # solo Intel
npm run build:win       # installer NSIS .exe (x64)
npm run build:linux     # .AppImage
```

Ogni app macOS ha **architettura pura**, non è un universal binary: `sharp`
carica un binario nativo per-architettura e impacchettarne due nello stesso
bundle è problematico. Le due app hanno nome e bundle id distinti
(`AuroraStudio-AppleSilicon`, `AuroraStudio-Intel`), altrimenti macOS le
tratterebbe come la stessa app e ne aprirebbe una sola.

Due binari nativi non arrivano dal repo e vengono scaricati dal `postinstall`:

- **ffmpeg** (`scripts/prepare-ffmpeg.js`) → `resources/ffmpeg/<piattaforma>-<arch>/`,
  serve alla Pulizia Metadati sui video.
- **sharp per l'altra architettura macOS** (`scripts/prepare-mac-sharp.js`), solo
  se compili entrambe le app da un unico Mac.

Nessuno dei due fa fallire `npm install` se sei offline, quindi una build può
uscire senza ffmpeg e rompersi solo a runtime. Per questo la
[CI](.github/workflows/build.yml) ne verifica la presenza **prima** di compilare,
e controlla gli artefatti montando i dmg prodotti. Le release sono compilate su
runner macOS Apple Silicon, macOS Intel, Windows e Linux reali, ciascuno nativo
per la propria architettura.

## Struttura

```
main.ts        processo Main: sharp, ffmpeg, pdf-lib, dialoghi
preload.ts     ponte sicuro (contextBridge)
renderer.ts    interfaccia
index.html     UI in stile Gemini, tema chiaro/scuro
icons/         icona sorgente e .icns
scripts/       preparazione binari nativi (ffmpeg, sharp cross-arch)
afterPack.js   rimuove da ogni app il sharp dell'architettura sbagliata
```

## Licenza

[GPL-3.0](LICENSE). I componenti di terze parti inclusi nell'app (tra cui i
binari FFmpeg, GPL), con le rispettive licenze e citazioni, sono elencati in
[THIRD-PARTY-LICENSES.md](THIRD-PARTY-LICENSES.md); i testi delle licenze
viaggiano anche dentro l'app distribuita, nella cartella `licenses/` delle
sue risorse.
