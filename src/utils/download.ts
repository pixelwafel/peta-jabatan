/**
 * Trigger a browser download for an in-memory Blob. Dipakai oleh alur ekspor
 * single-OPD (ExportDialog) maupun ekspor massal (BulkExportDialog) — supaya
 * mekanisme unduhnya konsisten di satu tempat.
 */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
