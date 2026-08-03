import { Project } from '@/models/project';

function slug(s: string): string {
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
