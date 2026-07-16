import { app, BrowserWindow, ipcMain, dialog, IpcMainInvokeEvent } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { spawn } from 'child_process';
import sharp from 'sharp';
import { PDFDocument, PDFName } from 'pdf-lib';
import ffmpegStatic from 'ffmpeg-static';

// Le build macOS si chiamano AuroraStudio-AppleSilicon e AuroraStudio-Intel
// (bundle name e id distinti, altrimenti LaunchServices le confonde). Electron
// deriva da quel nome anche la cartella dei dati utente, dove finisce pure il
// localStorage in cui il renderer salva il tema: senza questa riga le due
// architetture partirebbero con preferenze separate.
app.setName('AuroraStudio');

const LOSSLESS = 'Lossless (Non distruttivo)';

// ---- Metadata Cleaner: formati supportati -----------------------------------
// Estensioni immagine che libvips (sharp) sa RI-CODIFICARE nello stesso formato.
const CLEAN_IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'avif', 'tiff', 'tif', 'gif'];
// Immagini che sappiamo aprire ma non riscrivere nello stesso formato:
// vengono ripulite convertendole (bmp -> png, heic/heif -> jpg).
const CLEAN_IMAGE_CONVERT: Record<string, string> = { bmp: 'png', heic: 'jpg', heif: 'jpg' };
const CLEAN_VIDEO_EXTS = [
  'mp4', 'mov', 'm4v', 'mkv', 'webm', 'avi', 'wmv', 'flv',
  '3gp', '3g2', 'mpg', 'mpeg', 'ts', 'mts', 'm2ts'
];

// Risoluzione del binario ffmpeg:
// - impacchettato: resources/ffmpeg/ffmpeg[.exe] (extraResources per-piattaforma,
//   vedi package.json → mac/win/linux.extraResources).
// - sviluppo: i binari preparati da scripts/prepare-ffmpeg.js, altrimenti ffmpeg-static.
function resolveFfmpegPath(): string | null {
  const exe = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'ffmpeg', exe);
  }
  const local = path.join(__dirname, 'resources', 'ffmpeg', `${process.platform}-${process.arch}`, exe);
  if (fs.existsSync(local)) return local;
  return ffmpegStatic ? (ffmpegStatic as string) : null;
}
const FFMPEG_PATH = resolveFfmpegPath();

let mainWindow: BrowserWindow | null = null;
let tempCacheDir: string | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    backgroundColor: '#131314',
    show: false
  });

  mainWindow.loadFile('index.html');
  mainWindow.once('ready-to-show', () => mainWindow && mainWindow.show());
}

app.whenReady().then(() => {
  tempCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aurorastudio-cache-'));
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (tempCacheDir && fs.existsSync(tempCacheDir)) {
    fs.rmSync(tempCacheDir, { recursive: true, force: true });
  }
  if (process.platform !== 'darwin') app.quit();
});

// ---- helpers ---------------------------------------------------------------

async function askOutputDir(defaultDir: string, title: string): Promise<string | null> {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow!, {
    title,
    defaultPath: defaultDir,
    buttonLabel: 'Salva qui',
    properties: ['openDirectory', 'createDirectory']
  });
  if (canceled || !filePaths.length) return null;
  return filePaths[0];
}

async function confirmOverwrite(count: number): Promise<boolean> {
  const { response } = await dialog.showMessageBox(mainWindow!, {
    type: 'warning',
    buttons: ['Sovrascrivi', 'Annulla'],
    defaultId: 0,
    cancelId: 1,
    title: 'File esistenti',
    message: count === 1
      ? 'Un file con lo stesso nome esiste già nella destinazione.'
      : `${count} file con lo stesso nome esistono già nella destinazione.`,
    detail: 'Vuoi sovrascriverli?'
  });
  return response === 0;
}

// ---- IPC -------------------------------------------------------------------

ipcMain.handle('dialog:openFiles', async (_e: IpcMainInvokeEvent, opts: OpenFilesOpts = {}) => {
  let filters;
  if (opts.allFiles) {
    filters = [{ name: 'Tutti i file', extensions: ['*'] }];
  } else if (opts.json) {
    filters = [{ name: 'Export Bitwarden (JSON)', extensions: ['json'] }];
  } else if (opts.media) {
    filters = [
      { name: 'Immagini, video e PDF', extensions: [...CLEAN_IMAGE_EXTS, ...CLEAN_VIDEO_EXTS, 'pdf'] },
      { name: 'Tutti i file', extensions: ['*'] }
    ];
  } else {
    filters = [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif', 'tiff'] }];
  }
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile', 'multiSelections'],
    filters
  });
  return canceled ? [] : filePaths;
});

ipcMain.handle('image:size', async (_e: IpcMainInvokeEvent, filePath: string): Promise<ImageSize | null> => {
  try {
    const m = await sharp(filePath).metadata();
    return { width: m.width as number, height: m.height as number };
  } catch (e) {
    return null;
  }
});

ipcMain.handle('process:batch', async (event: IpcMainInvokeEvent, opts: BatchOptions): Promise<ProcResult> => {
  const { files, format, mode, quality, width, height } = opts;
  if (!files.length) return { success: false, error: 'No files provided' };

  const outDir = await askOutputDir(path.dirname(files[0]), 'Scegli dove salvare le immagini elaborate');
  if (!outDir) return { success: false, canceled: true };
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const isOriginal = format === 'Originale';
  const planOutPath = (file: string): string => {
    const parsed = path.parse(file);
    let outFormat = isOriginal ? parsed.ext.substring(1).toLowerCase() : format.toLowerCase();
    if (outFormat === 'jpeg') outFormat = 'jpg';
    return path.join(outDir, `${parsed.name}_mod.${outFormat}`);
  };

  const existingCount = files.filter((f) => fs.existsSync(planOutPath(f))).length;
  if (existingCount > 0 && !(await confirmOverwrite(existingCount))) {
    return { success: false, canceled: true };
  }

  try {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const parsed = path.parse(file);
      let outFormat = isOriginal ? parsed.ext.substring(1).toLowerCase() : format.toLowerCase();
      if (outFormat === 'jpeg') outFormat = 'jpg';
      const outFile = planOutPath(file);
      const hasResize = !!(width || height);

      // "Originale" without resizing = keep the file byte-for-byte (no re-encode).
      if (isOriginal && !hasResize) {
        fs.copyFileSync(file, outFile);
        event.sender.send('process:progress', Math.round(((i + 1) / files.length) * 100));
        continue;
      }

      let transform = sharp(file);
      if (hasResize) {
        transform = transform.resize(width || null, height || null, { fit: 'inside' });
      }

      if (isOriginal) {
        // keep original format, high quality (only reached when resizing)
        if (outFormat === 'jpg') transform = transform.jpeg({ quality: 95 });
        else if (outFormat === 'webp') transform = transform.webp({ quality: 95 });
        else if (outFormat === 'png') transform = transform.png();
        // gif/bmp/tiff -> format inferred from output extension
      } else if (outFormat === 'webp') {
        if (mode === LOSSLESS) transform = transform.webp({ lossless: true });
        else transform = transform.webp({ quality });
      } else if (outFormat === 'jpg') {
        transform = transform.jpeg({ quality });
      } else if (outFormat === 'png') {
        // Lossless = plain deflate PNG. Lossy = palette quantization ("distruttivo").
        if (mode === LOSSLESS) transform = transform.png({ compressionLevel: 9 });
        else transform = transform.png({ palette: true, quality, compressionLevel: 9 });
      }

      await transform.toFile(outFile);
      event.sender.send('process:progress', Math.round(((i + 1) / files.length) * 100));
    }
    return { success: true, dir: outDir };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('process:pdf', async (event: IpcMainInvokeEvent, opts: PdfOptions): Promise<ProcResult> => {
  const { files, outName, orientation, marginPx, optimize, quality } = opts;
  if (!files.length) return { success: false, error: 'No files provided' };

  let pdfName = outName || 'output';
  if (!pdfName.toLowerCase().endsWith('.pdf')) pdfName += '.pdf';

  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow!, {
    title: 'Salva PDF',
    defaultPath: path.join(path.dirname(files[0]), pdfName),
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  });
  if (canceled || !filePath) return { success: false, canceled: true };
  const outFile = filePath;

  try {
    const pdfDoc = await PDFDocument.create();
    const PX_TO_PT = 72 / 96;
    const MAX_PT = 1417;

    const firstMeta = await sharp(files[0]).metadata();
    let firstW = (firstMeta.width as number) * PX_TO_PT;
    let firstH = (firstMeta.height as number) * PX_TO_PT;
    if (firstW > MAX_PT || firstH > MAX_PT) {
      const cap = MAX_PT / Math.max(firstW, firstH);
      firstW *= cap; firstH *= cap;
    }
    if (orientation === 'p' && firstW > firstH) { [firstW, firstH] = [firstH, firstW]; }
    if (orientation === 'l' && firstH > firstW) { [firstW, firstH] = [firstH, firstW]; }
    const fixedShortPT = Math.min(firstW, firstH);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const meta = await sharp(file).metadata();
      let imgData: Buffer;
      let ext = path.extname(file).toLowerCase();

      if (optimize || !['.jpg', '.jpeg', '.png'].includes(ext)) {
        imgData = await sharp(file).jpeg({ quality: optimize ? quality : 100 }).toBuffer();
        ext = '.jpg';
      } else {
        imgData = fs.readFileSync(file);
      }

      const mw = meta.width as number;
      const mh = meta.height as number;
      const isLandscape = orientation === 'l' ? true : (orientation === 'p' ? false : mw >= mh);
      const ratio = mw / mh;
      const pageW = isLandscape ? fixedShortPT * ratio : fixedShortPT;
      const pageH = isLandscape ? fixedShortPT : fixedShortPT / ratio;

      const page = pdfDoc.addPage([pageW, pageH]);
      const pdfImg = ext === '.png' ? await pdfDoc.embedPng(imgData) : await pdfDoc.embedJpg(imgData);

      const mPT = marginPx * PX_TO_PT;
      const drawW = pageW - mPT * 2;
      const drawH = pageH - mPT * 2;
      const scale = Math.min(drawW / pdfImg.width, drawH / pdfImg.height);
      const fW = pdfImg.width * scale;
      const fH = pdfImg.height * scale;
      const x = mPT + (drawW - fW) / 2;
      const y = mPT + (drawH - fH) / 2;

      page.drawImage(pdfImg, { x, y, width: fW, height: fH });
      event.sender.send('process:progress', Math.round(((i + 1) / files.length) * 100));
    }

    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(outFile, pdfBytes);
    return { success: true, dir: outFile };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('process:combiner', async (event: IpcMainInvokeEvent, opts: CombinerOptions): Promise<ProcResult> => {
  const { files, direction, splitPoints } = opts;
  if (!files.length) return { success: false, error: 'No files provided' };

  const outDir = await askOutputDir(path.dirname(files[0]), 'Scegli dove salvare le immagini combinate');
  if (!outDir) return { success: false, canceled: true };
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  try {
    const bounds = [0, ...splitPoints, files.length];
    const segments: { first: number; last: number }[] = [];
    for (let i = 0; i < bounds.length - 1; i++) {
      segments.push({ first: bounds[i] + 1, last: bounds[i + 1] });
    }

    const segOutName = (seg: { first: number; last: number }) =>
      (seg.first === seg.last ? String(seg.first) : `${seg.first}-${seg.last}`) + '.jpg';
    const existingCount = segments.filter((seg) => fs.existsSync(path.join(outDir, segOutName(seg)))).length;
    if (existingCount > 0 && !(await confirmOverwrite(existingCount))) {
      return { success: false, canceled: true };
    }

    const isHorizontal = direction === 'h';

    for (let sIdx = 0; sIdx < segments.length; sIdx++) {
      const seg = segments[sIdx];
      const segFiles = files.slice(seg.first - 1, seg.last);
      if (segFiles.length === 0) continue;

      const metas = await Promise.all(segFiles.map((f) => sharp(f).metadata()));

      let totalW = 0, totalH = 0;
      const compositeOps: any[] = [];

      if (isHorizontal) {
        const maxH = Math.max(...metas.map((m) => m.height as number));
        totalH = maxH;
        for (let i = 0; i < segFiles.length; i++) {
          const buf = await sharp(segFiles[i]).resize({ height: maxH }).toBuffer();
          const bm = await sharp(buf).metadata();
          compositeOps.push({ input: buf, left: totalW, top: 0 });
          totalW += bm.width as number;
        }
      } else {
        const maxW = Math.max(...metas.map((m) => m.width as number));
        totalW = maxW;
        for (let i = 0; i < segFiles.length; i++) {
          const buf = await sharp(segFiles[i]).resize({ width: maxW }).toBuffer();
          const bm = await sharp(buf).metadata();
          compositeOps.push({ input: buf, left: 0, top: totalH });
          totalH += bm.height as number;
        }
      }

      const outFile = path.join(outDir, segOutName(seg));
      await sharp({ create: { width: totalW, height: totalH, channels: 3, background: { r: 0, g: 0, b: 0 } } })
        .composite(compositeOps)
        .jpeg({ quality: 100 })
        .toFile(outFile);

      event.sender.send('process:progress', Math.round(((sIdx + 1) / segments.length) * 100));
    }
    return { success: true, dir: outDir };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('file:stats', async (_e: IpcMainInvokeEvent, paths: string[]): Promise<FileStat[]> => {
  return paths.map((p) => {
    try {
      const stats = fs.statSync(p);
      return { path: p, name: path.basename(p), birthtimeMs: stats.birthtimeMs, mtimeMs: stats.mtimeMs };
    } catch (e) {
      return { path: p, name: path.basename(p), birthtimeMs: 0, mtimeMs: 0 };
    }
  });
});

ipcMain.handle('process:rename', async (event: IpcMainInvokeEvent, opts: RenameOptions): Promise<ProcResult> => {
  const { files, prefix, suffix, replaceFind, replaceWith, removeText } = opts;
  if (!files.length) return { success: false, error: 'No files provided' };
  try {
    const ops: { oldPath: string; newPath: string }[] = [];
    for (const oldPath of files) {
      const dir = path.dirname(oldPath);
      const ext = path.extname(oldPath);
      let base = path.basename(oldPath, ext);

      if (removeText) base = base.split(removeText).join('');
      if (replaceFind) base = base.split(replaceFind).join(replaceWith || '');
      if (prefix) base = prefix + base;
      if (suffix) base = base + suffix;

      const newName = base + ext;
      if (newName !== path.basename(oldPath)) {
        ops.push({ oldPath, newPath: path.join(dir, newName) });
      }
    }

    if (ops.length === 0) return { success: true, count: 0 };

    const sources = new Set(ops.map((o) => o.oldPath));
    const existingCount = ops.filter((o) => fs.existsSync(o.newPath) && !sources.has(o.newPath)).length;
    if (existingCount > 0 && !(await confirmOverwrite(existingCount))) {
      return { success: false, canceled: true };
    }

    let count = 0;
    for (let i = 0; i < ops.length; i++) {
      const { oldPath, newPath } = ops[i];
      if (fs.existsSync(newPath) && !sources.has(newPath)) {
        try { fs.rmSync(newPath); } catch (e) { /* ignore */ }
      }
      fs.renameSync(oldPath, newPath);
      count++;
      event.sender.send('process:progress', Math.round(((i + 1) / ops.length) * 100));
    }
    return { success: true, count };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
});

// ---- Metadata Cleaner ------------------------------------------------------
// Rimuove i metadati che ledono la privacy (GPS, data/ora, dispositivo, autore,
// software, miniature) da immagini, video e PDF, scrivendo copie ripulite.

function cleanKind(ext: string): 'image' | 'video' | 'pdf' | null {
  if (ext === 'pdf') return 'pdf';
  if (CLEAN_IMAGE_EXTS.includes(ext) || ext in CLEAN_IMAGE_CONVERT) return 'image';
  if (CLEAN_VIDEO_EXTS.includes(ext)) return 'video';
  return null;
}

// Estensione di output: uguale all'originale, salvo i formati non riscrivibili.
function cleanOutExt(ext: string): string {
  if (ext in CLEAN_IMAGE_CONVERT) return CLEAN_IMAGE_CONVERT[ext];
  return ext === 'jpeg' ? 'jpg' : ext;
}

async function cleanImage(file: string, outFile: string, outExt: string): Promise<void> {
  const animated = outExt === 'gif' || outExt === 'webp';
  // Default di sharp = scarta TUTTI i metadati (EXIF/GPS/XMP/IPTC). Manteniamo
  // solo il profilo colore ICC per non alterare i colori.
  let t = sharp(file, { animated, limitInputPixels: false }).keepIccProfile();
  switch (outExt) {
    case 'jpg': t = t.jpeg({ quality: 100 }); break;
    case 'png': t = t.png({ compressionLevel: 9 }); break;
    case 'webp': t = t.webp({ lossless: true }); break;
    case 'avif': t = t.avif({ lossless: true }); break;
    case 'tiff': case 'tif': t = t.tiff(); break;
    case 'gif': t = t.gif(); break;
  }
  await t.toFile(outFile);
}

async function cleanPdf(file: string, outFile: string): Promise<void> {
  const bytes = fs.readFileSync(file);
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
  // Azzera l'Info dictionary (autore, titolo, soggetto, keywords, software).
  pdf.setTitle('');
  pdf.setAuthor('');
  pdf.setSubject('');
  pdf.setKeywords([]);
  pdf.setProducer('');
  pdf.setCreator('');
  // Rimuove lo stream XMP dal catalogo (spesso duplica autore/GPS/data).
  try { pdf.catalog.delete(PDFName.of('Metadata')); } catch (e) { /* nessun XMP */ }
  const out = await pdf.save({ updateFieldAppearances: false });
  fs.writeFileSync(outFile, out);
}

function cleanVideo(file: string, outFile: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!FFMPEG_PATH || !fs.existsSync(FFMPEG_PATH)) {
      return reject(new Error('ffmpeg non disponibile'));
    }
    // -map 0        : conserva TUTTE le tracce (video/audio/sottotitoli)
    // -map_metadata -1 / -map_chapters -1 : elimina metadati globali e capitoli
    // -c copy       : stream copy, NESSUNA ricompressione (rapido, senza perdita)
    const args = [
      '-y', '-i', file,
      '-map', '0',
      '-map_metadata', '-1',
      '-map_chapters', '-1',
      '-c', 'copy',
      outFile
    ];
    const proc = spawn(FFMPEG_PATH, args, { windowsHide: true });
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim().split('\n').pop() || `ffmpeg uscito con codice ${code}`));
    });
  });
}

ipcMain.handle('process:clean', async (event: IpcMainInvokeEvent, opts: CleanOptions): Promise<ProcResult> => {
  const { files } = opts;
  if (!files.length) return { success: false, error: 'No files provided' };

  const outDir = await askOutputDir(path.dirname(files[0]), 'Scegli dove salvare i file ripuliti');
  if (!outDir) return { success: false, canceled: true };
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const planOutPath = (file: string): string => {
    const parsed = path.parse(file);
    const ext = parsed.ext.substring(1).toLowerCase();
    return path.join(outDir, `${parsed.name}_clean.${cleanOutExt(ext)}`);
  };

  const supported = files.filter((f) => cleanKind(path.extname(f).substring(1).toLowerCase()) !== null);
  const existingCount = supported.filter((f) => fs.existsSync(planOutPath(f))).length;
  if (existingCount > 0 && !(await confirmOverwrite(existingCount))) {
    return { success: false, canceled: true };
  }

  let cleaned = 0;
  let failed = 0;
  let skipped = 0;
  const failedNames: string[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const ext = path.extname(file).substring(1).toLowerCase();
    const kind = cleanKind(ext);
    try {
      if (kind === null) {
        skipped++;
      } else {
        const outFile = planOutPath(file);
        if (kind === 'image') await cleanImage(file, outFile, cleanOutExt(ext));
        else if (kind === 'pdf') await cleanPdf(file, outFile);
        else await cleanVideo(file, outFile);
        cleaned++;
      }
    } catch (e) {
      failed++;
      failedNames.push(path.basename(file));
    }
    event.sender.send('process:progress', Math.round(((i + 1) / files.length) * 100));
  }

  return { success: true, dir: outDir, cleaned, failed, skipped, failedNames };
});

// ---- Bitwarden JSON → PDF --------------------------------------------------
// Legge un export Bitwarden (.json), raggruppa le voci per cartella e le stampa
// in un PDF su due colonne (riconversione del vecchio "Bitwarden Json Printer").

function escapeHtml(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

ipcMain.handle('bitwarden:parse', async (_e: IpcMainInvokeEvent, filePath: string): Promise<BitwardenParseResult> => {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);
    if (!data.items || !Array.isArray(data.items)) {
      return { success: false, error: 'Formato JSON non valido: manca l\'elenco "items".' };
    }

    const folderMap: Record<string, string> = {};
    if (Array.isArray(data.folders)) {
      data.folders.forEach((f: any) => { if (f && f.id) folderMap[f.id] = f.name; });
    }

    const byFolder: Record<string, BitwardenEntry[]> = {};
    let count = 0;
    for (const item of data.items) {
      const folderName = (item.folderId && folderMap[item.folderId]) ? folderMap[item.folderId] : 'Senza cartella';
      if (!byFolder[folderName]) byFolder[folderName] = [];
      const login = item.login || {};
      byFolder[folderName].push({
        name: item.name || 'Senza titolo',
        url: Array.isArray(login.uris) ? login.uris.map((u: any) => u && u.uri).filter(Boolean).join(', ') : '',
        username: login.username || '',
        password: login.password || '',
        notes: item.notes || ''
      });
      count++;
    }

    const groups: BitwardenGroup[] = Object.keys(byFolder).map((folder) => ({ folder, entries: byFolder[folder] }));
    return { success: true, groups, count };
  } catch (e: any) {
    return { success: false, error: 'Errore nella lettura del file JSON: ' + e.message };
  }
});

function buildBitwardenHtml(groups: BitwardenGroup[], font: string, title: string): string {
  const safeFont = /^[\w\s'"-]+$/.test(font) ? font : 'Georgia';
  const groupsHtml = groups.map((g, i) => {
    const entries = g.entries.map((en) => `
      <div class="entry">
        <h3>${escapeHtml(en.name)}</h3>
        <p><strong>URL:</strong> ${escapeHtml(en.url) || 'N/A'}</p>
        <p><strong>Username:</strong> ${escapeHtml(en.username) || 'N/A'}</p>
        <p><strong>Password:</strong> <span class="password">${escapeHtml(en.password) || 'N/A'}</span></p>
        <p><strong>Note:</strong> <span class="notes">${escapeHtml(en.notes) || 'N/A'}</span></p>
      </div>`).join('');
    return `<div class="folder-group"${i > 0 ? ' style="page-break-before:always"' : ''}>
      <h2>${escapeHtml(g.folder)}</h2>${entries}</div>`;
  }).join('');

  return `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><title>${escapeHtml(title)}</title>
  <style>
    body { font-family: ${safeFont}, serif; color: black; margin: 24px; font-size: 14px; }
    #title { text-align: center; font-size: 24pt; margin-bottom: 20px; }
    h2 { border-bottom: 1px solid black; padding-bottom: 3px; font-size: 14px; margin-bottom: 5px; page-break-after: avoid; }
    h3 { font-size: 14px; margin: 0 0 4px; }
    #output { column-count: 2; column-gap: 16px; }
    .entry { break-inside: avoid; margin-bottom: 12px; }
    .entry p { margin: 2px 0; word-wrap: break-word; overflow-wrap: break-word; }
    .folder-group { break-inside: auto; }
  </style></head>
  <body><h1 id="title">${escapeHtml(title)}</h1><div id="output">${groupsHtml}</div></body></html>`;
}

ipcMain.handle('bitwarden:exportPdf', async (_e: IpcMainInvokeEvent, opts: BitwardenExportOptions): Promise<ProcResult> => {
  const { groups, font } = opts;
  if (!groups || !groups.length) return { success: false, error: 'Nessun dato da esportare' };

  const today = new Date();
  const stamp = today.toISOString().slice(0, 10); // yyyy-mm-dd
  const title = 'Bitwarden Password - ' + stamp.replace(/-/g, ' ');
  const defaultName = 'Bitwarden_Password_' + stamp.replace(/-/g, '') + '.pdf';

  const saved = await dialog.showSaveDialog(mainWindow!, {
    title: 'Salva PDF password',
    defaultPath: path.join(os.homedir(), 'Desktop', defaultName),
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  });
  if (saved.canceled || !saved.filePath) return { success: false, canceled: true };

  let win: BrowserWindow | null = null;
  const tmpHtml = path.join(tempCacheDir || os.tmpdir(), `bitwarden-${Date.now()}.html`);
  try {
    fs.writeFileSync(tmpHtml, buildBitwardenHtml(groups, font, title), 'utf8');
    win = new BrowserWindow({ show: false, webPreferences: { javascript: false } });
    await win.loadFile(tmpHtml);
    const pdf = await win.webContents.printToPDF({
      printBackground: false,
      pageSize: 'A4',
      margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 }
    });
    fs.writeFileSync(saved.filePath, pdf);
    return { success: true, dir: saved.filePath };
  } catch (e: any) {
    return { success: false, error: e.message };
  } finally {
    if (win) win.destroy();
    try { fs.rmSync(tmpHtml, { force: true }); } catch (e) { /* ignore */ }
  }
});
