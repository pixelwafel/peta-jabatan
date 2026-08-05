import { Project } from '@/models/project';
import { uuid } from '@/utils/uuid';

/**
 * Proyek OPD kosong siap-pakai (satu Unit Utama, tanpa jabatan) — dipakai
 * baik oleh "Proyek Baru" di ProjectManagerDialog maupun akses cepat
 * "+ Tambah OPD" di OpdListSidebar, supaya cuma ada satu sumber kebenaran
 * untuk bentuk proyek kosong.
 */
export function buildBlankProject(): Project {
  // Suffix pendek supaya kodeOPD tidak selalu identik persis kalau operator
  // bikin beberapa proyek kosong berturut-turut (mencegah tabrakan nama file
  // saat diekspor bersamaan — lihat BulkExportDialog).
  const kodeSuffix = uuid().slice(0, 4).toUpperCase();

  return {
    id: uuid(),
    schemaVersion: '1.0.0',
    configVersion: '2026.1',
    meta: {
      namaOPD: 'Proyek Baru',
      kodeOPD: `OPD.NEW-${kodeSuffix}`,
      penyusun: '',
    },
    attributeSchema: [],
    nodes: [
      {
        id: uuid(),
        type: 'unit' as const,
        nama: 'Dinas / Unit Utama',
        nomor: '1',
        rumpun: [],
        rincian: [],
        custom: {},
        position: { x: 200, y: 100 },
        collapsed: false,
        order: 0,
      },
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
