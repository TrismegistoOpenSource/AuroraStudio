# Componenti di terze parti

Aurora Studio è distribuito sotto [GPL-3.0](LICENSE). Contiene e ridistribuisce
i componenti elencati qui sotto, ciascuno sotto la propria licenza. Tutte le
licenze sono compatibili con la GPL-3.0 e ne permettono la redistribuzione.

I testi completi delle licenze che lo richiedono sono nella cartella
[`licenses/`](licenses/); questi file vengono anche impacchettati dentro
l'app distribuita (cartella `licenses/` nelle risorse dell'app).

## Runtime

| Componente | Licenza | Copyright / origine |
|---|---|---|
| [Electron](https://www.electronjs.org) | MIT | © GitHub Inc. e contributori |
| — Chromium (dentro Electron) | licenze multiple (BSD e altre) | vedi `LICENSES.chromium.html`, impacchettato nell'app |
| — Node.js (dentro Electron) | MIT | © Node.js contributors |

## Elaborazione immagini e PDF

| Componente | Licenza | Copyright / origine |
|---|---|---|
| [sharp](https://sharp.pixelplumbing.com) | Apache-2.0 ([testo](licenses/Apache-2.0.txt)) | © Lovell Fuller e contributori |
| [libvips](https://www.libvips.org) (binari `@img/sharp-libvips-*`) | LGPL-3.0-or-later ([testo](licenses/LGPL-3.0.txt)) | © John Cupitt e libvips authors — [sorgenti](https://github.com/libvips/libvips) |
| [pdf-lib](https://pdf-lib.js.org) | MIT | © Andrew Dillon |

I binari precompilati di libvips includono a loro volta librerie di terze
parti (libpng, libwebp, harfbuzz, lcms, ecc.), ognuna con la propria licenza
permissiva o LGPL: l'elenco completo è nel `README.md` del pacchetto
`@img/sharp-libvips-*`, che viaggia **dentro l'app** in
`app.asar.unpacked/node_modules/@img/`.

## FFmpeg (Pulizia Metadati video)

| Componente | Licenza | Copyright / origine |
|---|---|---|
| Binari FFmpeg statici | **GPL** ([testo](LICENSE), la stessa dell'app) | © the FFmpeg developers — [sorgenti](https://ffmpeg.org/download.html) |
| [ffmpeg-static](https://github.com/eugeneware/ffmpeg-static) (wrapper npm) | GPL-3.0-or-later | © Eugene Ware e contributori |

I binari di ffmpeg **non stanno nel repository**: vengono scaricati in fase di
`npm install` (script `scripts/prepare-ffmpeg.js`) dalla release binaria di
`ffmpeg-static` (tag `b6.1.1`), che li compila in configurazione GPL (includono
x264). Sono ridistribuiti dentro l'app nel rispetto della GPL: Aurora Studio è
essa stessa GPL-3.0, e il codice sorgente di FFmpeg è disponibile su
[ffmpeg.org](https://ffmpeg.org) e tramite la release citata.

## Risorse

L'icona dell'app (`icons/`) è materiale proprio del progetto, coperta dalla
GPL-3.0 del repository. Il tool «Password → PDF» genera i PDF con i font di
sistema via `printToPDF` di Electron: nessun font viene ridistribuito.

## Strumenti solo di sviluppo (non distribuiti nell'app)

TypeScript ed electron-builder girano solo in fase di build e non fanno parte
dell'app distribuita: le loro licenze non riguardano chi scarica Aurora Studio.
