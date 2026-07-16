// Ambient shared types for Aurora Studio (visible to main, preload and renderer)

interface OpenFilesOpts {
  allFiles?: boolean;
  media?: boolean; // images + video + pdf (Metadata Cleaner)
  json?: boolean;  // Bitwarden export (.json)
}

interface BatchOptions {
  files: string[];
  format: string; // 'Originale' | 'JPG' | 'PNG' | 'WEBP'
  mode: string;   // 'Lossless (Non distruttivo)' | 'Lossy (Compresso)'
  quality: number;
  width: number | null;
  height: number | null;
}

interface PdfOptions {
  files: string[];
  outName: string;
  orientation: string; // 'auto' | 'p' | 'l'
  marginPx: number;
  optimize: boolean;
  quality: number;
}

interface CombinerOptions {
  files: string[];
  direction: string; // 'h' | 'v'
  splitPoints: number[];
}

interface RenameOptions {
  files: string[];
  prefix: string;
  suffix: string;
  replaceFind: string;
  replaceWith: string;
  removeText: string;
}

interface CleanOptions {
  files: string[];
}

interface BitwardenEntry {
  name: string;
  url: string;
  username: string;
  password: string;
  notes: string;
}

interface BitwardenGroup {
  folder: string;
  entries: BitwardenEntry[];
}

interface BitwardenParseResult {
  success: boolean;
  groups?: BitwardenGroup[];
  count?: number;
  error?: string;
}

interface BitwardenExportOptions {
  groups: BitwardenGroup[];
  font: string;
}

interface FileStat {
  path: string;
  name: string;
  birthtimeMs: number;
  mtimeMs: number;
}

interface ProcResult {
  success: boolean;
  canceled?: boolean;
  error?: string;
  dir?: string;
  count?: number;
  cleaned?: number;
  failed?: number;
  skipped?: number;
  failedNames?: string[];
}

interface ImageSize {
  width: number;
  height: number;
}

interface AuroraAPI {
  openFiles(opts?: OpenFilesOpts): Promise<string[]>;
  processBatch(options: BatchOptions): Promise<ProcResult>;
  processPdf(options: PdfOptions): Promise<ProcResult>;
  processCombiner(options: CombinerOptions): Promise<ProcResult>;
  processRename(options: RenameOptions): Promise<ProcResult>;
  cleanMetadata(options: CleanOptions): Promise<ProcResult>;
  parseBitwarden(filePath: string): Promise<BitwardenParseResult>;
  exportBitwardenPdf(options: BitwardenExportOptions): Promise<ProcResult>;
  getFileStats(paths: string[]): Promise<FileStat[]>;
  getImageSize(path: string): Promise<ImageSize | null>;
  getPathForFile(file: File): string;
  onProgress(callback: (percent: number) => void): void;
}

interface Window {
  api: AuroraAPI;
}
