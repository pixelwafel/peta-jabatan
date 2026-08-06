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
  // JSON membawa Project lengkap -> kodeOPD/namaOPD/updatedAt ASLI dipakai
  // (docs/14-recap-dashboard.md §4 staging butuh angka sebenarnya, bukan
  // turunan nama file). XLSX tidak membawa kodeOPD di sheet Struktur, jadi
  // tetap fallback ke turunan nama file seperti sebelumnya.
  const namaOPD = preview.sourceMeta?.namaOPD || fileName || 'Proyek Impor';

  const kodeSlug = slug(namaOPD).slice(0, 24).toUpperCase();
  const kodeOPD = preview.sourceMeta?.kodeOPD || kodeSlug || 'OPD.IMP';
  const updatedAt = preview.sourceMeta?.updatedAt || new Date().toISOString();

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
    // Instance template (docs/15-template-instance.md §4) — dari sheet
    // Satuan_<nomor> kalau ada; JSON membawa instances-nya sendiri lewat
    // preview.built langsung (jsonResultToPreview di ImportDialog.tsx).
    instances: preview.built.instances,
    viewport: { x: 0, y: 0, zoom: 1 },
    createdAt: new Date().toISOString(),
    updatedAt,
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
