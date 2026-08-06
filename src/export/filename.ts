import { Project } from '@/models/project';

export function slug(s: string): string {
  if (!s) return '';
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function exportFilename(project: Project, ext: string): string {
  const kode = slug(project.meta.kodeOPD) || 'opd';
  const nama = slug(project.meta.namaOPD).slice(0, 40);
  const date = new Date().toISOString().slice(0, 10);
  return `peta-jabatan_${kode}${nama ? '_' + nama : ''}_${date}.${ext}`;
}

/**
 * Nama file laporan (export/laporanExporter.ts) — prefiks `laporan_` sengaja
 * beda dari `peta-jabatan_` (exportFilename di atas) supaya tidak
 * tertukar/collide dengan ekspor data mentah yang sudah ada; laporan ini
 * artefak presentasi terpisah, bukan pengganti ekspor XLSX biasa.
 */
export function laporanFilename(project: Project, ext: string): string {
  const kode = slug(project.meta.kodeOPD) || 'opd';
  const nama = slug(project.meta.namaOPD).slice(0, 40);
  const date = new Date().toISOString().slice(0, 10);
  return `laporan_${kode}${nama ? '_' + nama : ''}_${date}.${ext}`;
}

export function laporanPemerintahFilename(ext: string): string {
  const date = new Date().toISOString().slice(0, 10);
  return `laporan-se-pemda_${date}.${ext}`;
}
