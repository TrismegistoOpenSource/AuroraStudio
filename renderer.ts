// ============================================================
//  AURORA STUDIO — Renderer (Frontend Logic)
// ============================================================

const byId = (id: string): any => document.getElementById(id);
const qsa = (sel: string): any[] => Array.from(document.querySelectorAll(sel));

// --- Navigation & "Canvas continua" (shared file list across tools) ---
const navBtns = qsa('.nav-btn');
const views = qsa('.view');

const TOOL_KEYS: Record<string, string> = {
  'batch-view': 'batch',
  'pdf-view': 'pdf',
  'combiner-view': 'comb',
  'rename-view': 'ren',
  'clean-view': 'clean',
  'bitw-view': 'bitw'
};

let continuousMode = true; // active by default
let currentTool = 'batch';

navBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    const targetId = btn.dataset.target;
    const toKey = TOOL_KEYS[targetId];

    // "bitw" non ha una lista di file immagine: escluso dalla canvas continua.
    if (continuousMode && toKey !== currentTool && toKey !== 'bitw' && currentTool !== 'bitw') {
      setToolFiles(toKey, getToolFiles(currentTool).slice());
    }

    navBtns.forEach((b) => b.classList.remove('active'));
    views.forEach((v) => v.classList.remove('active'));
    btn.classList.add('active');
    byId(targetId).classList.add('active');
    currentTool = toKey;
  });
});

const continuousToggle = byId('continuous-toggle');
continuousToggle.addEventListener('click', () => {
  continuousMode = !continuousMode;
  continuousToggle.classList.toggle('active', continuousMode);
});

// --- Theme toggle (manual light/dark, default dark, remembered) ---
const themeToggle = byId('theme-toggle');
themeToggle.addEventListener('click', () => {
  const cur = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  const next = cur === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
});

function getToolFiles(key: string): string[] {
  if (key === 'batch') return batchFiles;
  if (key === 'pdf') return pdfFiles;
  if (key === 'comb') return combFiles;
  if (key === 'clean') return cleanFiles;
  return renFiles;
}
function setToolFiles(key: string, arr: string[]): void {
  if (key === 'batch') {
    batchFiles = arr;
    renderList('batch-file-list', batchFiles);
    updateBatchRatio();
  } else if (key === 'pdf') {
    pdfFiles = arr;
    renderList('pdf-file-list', pdfFiles);
    autoPdfName();
  } else if (key === 'comb') {
    combFiles = arr;
    renderList('comb-file-list', combFiles);
  } else if (key === 'clean') {
    cleanFiles = arr;
    renderList('clean-file-list', cleanFiles);
  } else {
    renFiles = arr;
    renderRenamer();
  }
}

// --- Toast ---
let toastTimer: any;
function showToast(msg: string): void {
  const t = byId('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}

// --- File Arrays ---
let batchFiles: string[] = [];
let pdfFiles: string[] = [];
let combFiles: string[] = [];
let renFiles: string[] = [];
let cleanFiles: string[] = [];

// --- Sort State ---
const sortState: Record<string, { key: string; reversed: boolean }> = {
  pdf: { key: 'name', reversed: false },
  comb: { key: 'name', reversed: false }
};

// ============================================================
//  DRAG & DROP onto file lists
// ============================================================
const IMAGE_RE = /\.(jpe?g|png|webp|bmp|gif|tiff?)$/i;

window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());

function setupDropTarget(
  ulElement: any,
  getFiles: () => string[],
  setFiles: (f: string[]) => void,
  allowAll = false
): void {
  ulElement.addEventListener('dragover', (e: any) => {
    e.preventDefault();
    e.stopPropagation();
    ulElement.classList.add('drag-hover');
  });
  ulElement.addEventListener('dragleave', () => ulElement.classList.remove('drag-hover'));
  ulElement.addEventListener('drop', (e: any) => {
    e.preventDefault();
    e.stopPropagation();
    ulElement.classList.remove('drag-hover');
    const dropped = Array.from(e.dataTransfer.files as FileList)
      .filter((f) => allowAll || IMAGE_RE.test(f.name))
      .map((f) => window.api.getPathForFile(f))
      .filter(Boolean);
    if (dropped.length) {
      setFiles(getFiles().concat(dropped));
      showToast(`${dropped.length} file aggiunti`);
    }
  });
}

setupDropTarget(byId('batch-file-list'),
  () => batchFiles, (f) => { batchFiles = f; renderList('batch-file-list', batchFiles); updateBatchRatio(); });
setupDropTarget(byId('pdf-file-list'),
  () => pdfFiles, (f) => { pdfFiles = f; applySortAndRender('pdf'); autoPdfName(); });
setupDropTarget(byId('comb-file-list'),
  () => combFiles, (f) => { combFiles = f; applySortAndRender('comb'); });
setupDropTarget(byId('ren-file-list'),
  () => renFiles, (f) => { renFiles = f; renderRenamer(); }, true);
setupDropTarget(byId('clean-file-list'),
  () => cleanFiles, (f) => { cleanFiles = f; renderList('clean-file-list', cleanFiles); }, true);

// ============================================================
//  SORTING (PDF & Combiner)
// ============================================================
async function applySortAndRender(listId: string): Promise<void> {
  const files = listId === 'pdf' ? pdfFiles : combFiles;
  if (!files.length) { renderList(`${listId}-file-list`, files); return; }

  const st = sortState[listId];
  const stats = await window.api.getFileStats(files);

  stats.sort((a, b) => {
    let cmp = 0;
    if (st.key === 'name') cmp = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    else if (st.key === 'birth') cmp = a.birthtimeMs - b.birthtimeMs;
    else if (st.key === 'mtime') cmp = a.mtimeMs - b.mtimeMs;
    return st.reversed ? -cmp : cmp;
  });

  const sorted = stats.map((s) => s.path);
  if (listId === 'pdf') pdfFiles = sorted;
  else combFiles = sorted;
  renderList(`${listId}-file-list`, sorted);
}

qsa('.sort-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const listId = btn.dataset.listId;
    btn.parentElement.querySelectorAll('.sort-btn').forEach((b: any) => b.classList.remove('active'));
    btn.classList.add('active');
    sortState[listId].key = btn.dataset.sort;
    applySortAndRender(listId);
  });
});

qsa('.sort-reverse-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const listId = btn.dataset.listId;
    sortState[listId].reversed = !sortState[listId].reversed;
    btn.classList.toggle('reversed');
    applySortAndRender(listId);
  });
});

// ============================================================
//  BATCH TOOLS
// ============================================================
const batchFormat = byId('batch-format');
const batchMode = byId('batch-mode');
const batchQuality = byId('batch-quality');
const batchQualityVal = byId('batch-quality-val');
const batchModeField = byId('batch-mode-field');
const batchQualityField = byId('batch-quality-field');

function updateBatchVisibility(): void {
  const val = batchFormat.value;
  const isWebp = val === 'WEBP';
  const isPng = val === 'PNG';
  const isJpg = val === 'JPG';
  const hasMode = isWebp || isPng; // WebP and PNG both offer Lossless / Lossy

  batchModeField.style.display = hasMode ? 'flex' : 'none';

  // Quality slider: JPG always; WebP/PNG only in Lossy. Never for "Originale".
  let showQuality = false;
  if (isJpg) showQuality = true;
  if (hasMode && batchMode.value.includes('Lossy')) showQuality = true;

  batchQualityField.style.display = showQuality ? 'flex' : 'none';
}

batchFormat.addEventListener('change', updateBatchVisibility);
batchMode.addEventListener('change', updateBatchVisibility);
batchQuality.addEventListener('input', () => { batchQualityVal.textContent = batchQuality.value + '%'; });

updateBatchVisibility();

// --- Resize: auto-fill the opposite dimension from the first image's ratio ---
const batchWidth = byId('batch-width');
const batchHeight = byId('batch-height');
let batchRatio: number | null = null;

async function updateBatchRatio(): Promise<void> {
  if (!batchFiles.length) { batchRatio = null; return; }
  const size = await window.api.getImageSize(batchFiles[0]);
  batchRatio = size && size.height ? size.width / size.height : null;
}

batchWidth.addEventListener('input', () => {
  if (!batchRatio) return;
  const v = parseFloat(batchWidth.value);
  batchHeight.value = v > 0 ? String(Math.round(v / batchRatio)) : '';
});
batchHeight.addEventListener('input', () => {
  if (!batchRatio) return;
  const v = parseFloat(batchHeight.value);
  batchWidth.value = v > 0 ? String(Math.round(v * batchRatio)) : '';
});

byId('batch-add-btn').addEventListener('click', async () => {
  const files = await window.api.openFiles();
  batchFiles.push(...files);
  renderList('batch-file-list', batchFiles);
  updateBatchRatio();
});
byId('batch-clear-btn').addEventListener('click', () => {
  batchFiles = [];
  renderList('batch-file-list', batchFiles);
  updateBatchRatio();
});
byId('batch-start-btn').addEventListener('click', async () => {
  if (!batchFiles.length) return;
  const btn = byId('batch-start-btn');
  const prog = byId('batch-progress');
  const wrap = prog.parentElement;
  btn.disabled = true; wrap.style.opacity = '1'; prog.style.width = '0%';
  window.api.onProgress((p) => { prog.style.width = p + '%'; });

  const res = await window.api.processBatch({
    files: batchFiles,
    format: batchFormat.value,
    mode: batchMode.value,
    quality: parseInt(batchQuality.value),
    width: parseInt(batchWidth.value) || null,
    height: parseInt(batchHeight.value) || null
  });
  wrap.style.opacity = '0'; btn.disabled = false;
  if (res.canceled) showToast('Operazione annullata');
  else showToast(res.success ? 'Batch completato!' : 'Errore: ' + res.error);
});

// ============================================================
//  IMAGE TO PDF
// ============================================================
const pdfOptimize = byId('pdf-optimize');
const pdfQuality = byId('pdf-quality');
const pdfQualityVal = byId('pdf-quality-val');
const pdfQualityField = byId('pdf-quality-field');

pdfOptimize.addEventListener('change', () => {
  pdfQualityField.style.display = pdfOptimize.checked ? 'flex' : 'none';
});
pdfQuality.addEventListener('input', () => { pdfQualityVal.textContent = pdfQuality.value + '%'; });

function autoPdfName(): void {
  if (pdfFiles.length > 0) {
    const first = pdfFiles[0].split('/').pop()!.split('\\').pop()!;
    const nameNoExt = first.replace(/\.[^.]+$/, '');
    byId('pdf-name').value = nameNoExt;
  }
}

byId('pdf-add-btn').addEventListener('click', async () => {
  const files = await window.api.openFiles();
  pdfFiles.push(...files);
  applySortAndRender('pdf');
  autoPdfName();
});
byId('pdf-clear-btn').addEventListener('click', () => {
  pdfFiles = [];
  renderList('pdf-file-list', pdfFiles);
  byId('pdf-name').value = '';
});
byId('pdf-start-btn').addEventListener('click', async () => {
  if (!pdfFiles.length) return;
  const btn = byId('pdf-start-btn');
  const prog = byId('pdf-progress');
  const wrap = prog.parentElement;
  btn.disabled = true; wrap.style.opacity = '1'; prog.style.width = '0%';
  window.api.onProgress((p) => { prog.style.width = p + '%'; });

  const res = await window.api.processPdf({
    files: pdfFiles,
    outName: byId('pdf-name').value,
    orientation: byId('pdf-orientation').value,
    marginPx: parseInt(byId('pdf-margins').value),
    optimize: pdfOptimize.checked,
    quality: parseInt(pdfQuality.value)
  });
  wrap.style.opacity = '0'; btn.disabled = false;
  if (res.canceled) showToast('Operazione annullata');
  else showToast(res.success ? 'PDF creato!' : 'Errore: ' + res.error);
});

// ============================================================
//  COMBINER
// ============================================================
byId('comb-add-btn').addEventListener('click', async () => {
  const files = await window.api.openFiles();
  combFiles.push(...files);
  applySortAndRender('comb');
});
byId('comb-clear-btn').addEventListener('click', () => {
  combFiles = [];
  renderList('comb-file-list', combFiles);
});
byId('comb-start-btn').addEventListener('click', async () => {
  if (!combFiles.length) return;
  const btn = byId('comb-start-btn');
  const prog = byId('comb-progress');
  const wrap = prog.parentElement;
  btn.disabled = true; wrap.style.opacity = '1'; prog.style.width = '0%';
  window.api.onProgress((p) => { prog.style.width = p + '%'; });

  const rawSplit = byId('comb-split').value as string;
  const splitPoints = rawSplit.split(/[\s,]+/).map((s) => parseInt(s))
    .filter((n) => !isNaN(n) && n > 0 && n < combFiles.length);

  const res = await window.api.processCombiner({
    files: combFiles,
    direction: byId('comb-direction').value,
    splitPoints: Array.from(new Set(splitPoints)).sort((a, b) => a - b)
  });
  wrap.style.opacity = '0'; btn.disabled = false;
  if (res.canceled) showToast('Operazione annullata');
  else showToast(res.success ? 'Immagini combinate!' : 'Errore: ' + res.error);
});

// ============================================================
//  RENAMER (live double-panel preview)
// ============================================================
function renamePreviewName(filename: string): string {
  const dot = filename.lastIndexOf('.');
  const ext = dot > 0 ? filename.slice(dot) : '';
  let base = dot > 0 ? filename.slice(0, dot) : filename;

  const prefix = byId('ren-prefix').value;
  const suffix = byId('ren-suffix').value;
  const removeText = byId('ren-remove').value;
  const replaceFind = byId('ren-find').value;
  const replaceWith = byId('ren-replace').value;

  if (removeText) base = base.split(removeText).join('');
  if (replaceFind) base = base.split(replaceFind).join(replaceWith || '');
  if (prefix) base = prefix + base;
  if (suffix) base = base + suffix;

  return base + ext;
}

function renderRenamer(): void {
  const origUl = byId('ren-file-list');
  const prevUl = byId('ren-preview-list');
  origUl.innerHTML = '';
  prevUl.innerHTML = '';

  const names = renFiles.map((f) => f.split('/').pop()!.split('\\').pop()!);
  const newNames = names.map(renamePreviewName);

  const counts: Record<string, number> = {};
  newNames.forEach((n) => { counts[n] = (counts[n] || 0) + 1; });

  names.forEach((name, i) => {
    const li = document.createElement('li');
    li.textContent = name;
    origUl.appendChild(li);

    const pli = document.createElement('li');
    pli.textContent = newNames[i];
    if (counts[newNames[i]] > 1) {
      pli.classList.add('preview-collision');
      pli.title = 'Nome duplicato: creerebbe un conflitto';
    } else if (newNames[i] !== name) {
      pli.classList.add('preview-changed');
    } else {
      pli.classList.add('preview-same');
    }
    prevUl.appendChild(pli);
  });
}

['ren-prefix', 'ren-suffix', 'ren-remove', 'ren-find', 'ren-replace']
  .forEach((id) => byId(id).addEventListener('input', renderRenamer));

byId('ren-add-btn').addEventListener('click', async () => {
  const files = await window.api.openFiles({ allFiles: true });
  renFiles.push(...files);
  renderRenamer();
});
byId('ren-clear-btn').addEventListener('click', () => {
  renFiles = [];
  renderRenamer();
});
byId('ren-start-btn').addEventListener('click', async () => {
  if (!renFiles.length) return;
  const btn = byId('ren-start-btn');
  const prog = byId('ren-progress');
  const wrap = prog.parentElement;
  btn.disabled = true; wrap.style.opacity = '1'; prog.style.width = '0%';
  window.api.onProgress((p) => { prog.style.width = p + '%'; });

  const res = await window.api.processRename({
    files: renFiles,
    prefix: byId('ren-prefix').value,
    suffix: byId('ren-suffix').value,
    removeText: byId('ren-remove').value,
    replaceFind: byId('ren-find').value,
    replaceWith: byId('ren-replace').value
  });
  wrap.style.opacity = '0'; btn.disabled = false;
  if (res.canceled) {
    showToast('Operazione annullata');
  } else if (res.success) {
    showToast(`${res.count} file rinominati!`);
    renFiles = [];
    renderRenamer();
  } else {
    showToast('Errore: ' + res.error);
  }
});

// ============================================================
//  METADATA CLEANER
// ============================================================
byId('clean-add-btn').addEventListener('click', async () => {
  const files = await window.api.openFiles({ media: true });
  cleanFiles.push(...files);
  renderList('clean-file-list', cleanFiles);
});
byId('clean-clear-btn').addEventListener('click', () => {
  cleanFiles = [];
  renderList('clean-file-list', cleanFiles);
});
byId('clean-start-btn').addEventListener('click', async () => {
  if (!cleanFiles.length) return;
  const btn = byId('clean-start-btn');
  const prog = byId('clean-progress');
  const wrap = prog.parentElement;
  btn.disabled = true; wrap.style.opacity = '1'; prog.style.width = '0%';
  window.api.onProgress((p) => { prog.style.width = p + '%'; });

  const res = await window.api.cleanMetadata({ files: cleanFiles });
  wrap.style.opacity = '0'; btn.disabled = false;
  if (res.canceled) {
    showToast('Operazione annullata');
  } else if (res.success) {
    let msg = `${res.cleaned} file ripuliti`;
    if (res.skipped) msg += ` · ${res.skipped} ignorati`;
    if (res.failed) msg += ` · ${res.failed} falliti`;
    showToast(msg);
  } else {
    showToast('Errore: ' + res.error);
  }
});

// ============================================================
//  BITWARDEN PASSWORD → PDF
// ============================================================
let bitwGroups: BitwardenGroup[] | null = null;
let bitwFont = 'Georgia';
const bitwOutput = byId('bitw-output');

function escapeHtmlR(v: any): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function renderBitwarden(): void {
  if (!bitwGroups || !bitwGroups.length) {
    bitwOutput.style.fontFamily = '';
    bitwOutput.innerHTML = '<p class="bitw-empty">Scegli o trascina qui un file <code>.json</code> esportato da Bitwarden.</p>';
    return;
  }
  bitwOutput.style.fontFamily = bitwFont + ', serif';
  bitwOutput.innerHTML = bitwGroups.map((g) => {
    const entries = g.entries.map((en) => `
      <div class="bitw-entry">
        <h4>${escapeHtmlR(en.name)}</h4>
        <p><strong>URL:</strong> ${escapeHtmlR(en.url) || 'N/A'}</p>
        <p><strong>Username:</strong> ${escapeHtmlR(en.username) || 'N/A'}</p>
        <p><strong>Password:</strong> ${escapeHtmlR(en.password) || 'N/A'}</p>
        <p><strong>Note:</strong> ${escapeHtmlR(en.notes) || 'N/A'}</p>
      </div>`).join('');
    return `<div class="bitw-folder"><h3>${escapeHtmlR(g.folder)}</h3>${entries}</div>`;
  }).join('');
}

async function loadBitwarden(filePath: string): Promise<void> {
  const res = await window.api.parseBitwarden(filePath);
  if (!res.success || !res.groups) {
    bitwGroups = null;
    renderBitwarden();
    byId('bitw-export-btn').disabled = true;
    byId('bitw-count').textContent = '';
    byId('bitw-filename').textContent = '';
    showToast(res.error || 'Errore nel file JSON');
    return;
  }
  bitwGroups = res.groups;
  renderBitwarden();
  byId('bitw-export-btn').disabled = false;
  byId('bitw-count').textContent = `${res.count} voci · ${res.groups.length} cartelle`;
  byId('bitw-filename').textContent = filePath.split('/').pop()!.split('\\').pop()!;
}

byId('bitw-file-btn').addEventListener('click', async () => {
  const files = await window.api.openFiles({ json: true });
  if (files.length) loadBitwarden(files[0]);
});

bitwOutput.addEventListener('dragover', (e: any) => {
  e.preventDefault(); e.stopPropagation(); bitwOutput.classList.add('drag-hover');
});
bitwOutput.addEventListener('dragleave', () => bitwOutput.classList.remove('drag-hover'));
bitwOutput.addEventListener('drop', (e: any) => {
  e.preventDefault(); e.stopPropagation(); bitwOutput.classList.remove('drag-hover');
  const f = Array.from(e.dataTransfer.files as FileList).find((x) => /\.json$/i.test(x.name));
  if (f) loadBitwarden(window.api.getPathForFile(f));
});

byId('bitw-font').addEventListener('change', () => {
  bitwFont = byId('bitw-font').value;
  renderBitwarden();
});
byId('bitw-font-apply').addEventListener('click', () => {
  const v = byId('bitw-font-input').value.trim();
  if (v) { bitwFont = v; renderBitwarden(); }
});

byId('bitw-export-btn').addEventListener('click', async () => {
  if (!bitwGroups) return;
  const btn = byId('bitw-export-btn');
  btn.disabled = true;
  const res = await window.api.exportBitwardenPdf({ groups: bitwGroups, font: bitwFont });
  btn.disabled = false;
  if (res.canceled) showToast('Operazione annullata');
  else showToast(res.success ? 'PDF creato!' : 'Errore: ' + res.error);
});

// ============================================================
//  RENDER FILE LIST
// ============================================================
function renderList(id: string, arr: string[]): void {
  const ul = byId(id);
  ul.innerHTML = '';
  arr.forEach((f) => {
    const li = document.createElement('li');
    li.textContent = f.split('/').pop()!.split('\\').pop()!;
    ul.appendChild(li);
  });
}
