import { contextBridge, ipcRenderer, webUtils } from 'electron';

const api: AuroraAPI = {
  openFiles: (opts?: OpenFilesOpts) => ipcRenderer.invoke('dialog:openFiles', opts),
  processBatch: (options: BatchOptions) => ipcRenderer.invoke('process:batch', options),
  processPdf: (options: PdfOptions) => ipcRenderer.invoke('process:pdf', options),
  processCombiner: (options: CombinerOptions) => ipcRenderer.invoke('process:combiner', options),
  processRename: (options: RenameOptions) => ipcRenderer.invoke('process:rename', options),
  cleanMetadata: (options: CleanOptions) => ipcRenderer.invoke('process:clean', options),
  parseBitwarden: (filePath: string) => ipcRenderer.invoke('bitwarden:parse', filePath),
  exportBitwardenPdf: (options: BitwardenExportOptions) => ipcRenderer.invoke('bitwarden:exportPdf', options),
  getFileStats: (paths: string[]) => ipcRenderer.invoke('file:stats', paths),
  getImageSize: (path: string) => ipcRenderer.invoke('image:size', path),
  // In Electron 32+ File.path was removed; webUtils.getPathForFile resolves it.
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  onProgress: (callback: (percent: number) => void) => {
    // Keep exactly one listener so callbacks don't accumulate across runs.
    ipcRenderer.removeAllListeners('process:progress');
    ipcRenderer.on('process:progress', (_e, percent: number) => callback(percent));
  }
};

contextBridge.exposeInMainWorld('api', api);
