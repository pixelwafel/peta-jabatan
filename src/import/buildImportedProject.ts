import { Project } from '@/models/project';
import { ImportPreview } from './xlsxImporter';
import { computeLayout } from '@/utils/layout';
import { uuid } from '@/utils/uuid';
import { slug } from '@/export/filename';

/**
 * Bangun Project baru dari hasil parsing satu berkas (built.nodes/edges sudah
 * lengkap — lihat ImportPreview). Dipakai baik oleh commit satu-per-satu
 * maupun commit-semua di ImportDialog, supaya logikanya cuma ada di satu
 * tempat walau dipanggil berkali-kali untuk banyak berkas sekaligus.
 */
export function buildImportedProject(preview: ImportPreview, fileName: string): Project {
  const namaOPD = fileName || 'Proyek Impor';

  // kodeOPD placeholder diturunkan dari nama file (bukan literal tetap
  // 'OPD.IMP' untuk semua impor) — supaya kalau beberapa berkas diimpor
  // sekaligus dalam satu sesi, tiap proyek tidak berakhir dengan kode yang
  // sama persis dan sulit dibedakan di daftar OPD.
  const kodeSlug = slug(namaOPD).slice(0, 24).toUpperCase();
  const kodeOPD = kodeSlug || 'OPD.IMP';

  const project: Project = {
    id: uuid(),
    schemaVersion: '1.0.0',
    configVersion: '2026.1',
    meta: {
      namaOPD,
      kodeOPD,
      penyusun: 'Imported File',
      tahunAnggaran: new Date().getFullYear().toString(),
    },
    attributeSchema: [],
    nodes: preview.built.nodes,
    edges: preview.built.edges,
    viewport: { x: 0, y: 0, zoom: 1 },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Layout Dagre otomatis untuk impor XLSX (posisi awal semua 0,0). Untuk
  // impor JSON yang sudah punya posisi tersimpan, ini menimpanya — sama
  // seperti perilaku commit sebelumnya, tidak diubah di sini.
  const layout = computeLayout(project.nodes, project.edges, {
    direction: 'TB',
    scope: 'all',
  });

  for (const n of project.nodes) {
    const pos = layout.get(n.id);
    if (pos) n.position = pos;
  }

  return project;
}
