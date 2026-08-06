import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { processXlsxImport } from '../src/import/xlsxImporter';
import { exportXlsx } from '../src/export/xlsxExporter';
import { computeRecap } from '../src/selectors/recap';
import { taxonomy } from '../src/config/taxonomy';
import { Project } from '../src/models/project';
import { OrgNode } from '../src/models/node';
import { UnitInstance } from '../src/models/project';

function makeSekolahProject(instances: UnitInstance[]): Project {
  const nodes: OrgNode[] = [
    {
      id: 'root',
      type: 'unit',
      nama: 'Dinas Pendidikan',
      nomor: '1',
      rumpun: [],
      rincian: [],
      custom: {},
      position: { x: 0, y: 0 },
      collapsed: false,
      order: 0,
    },
    {
      id: 'sekolah',
      type: 'unit',
      nama: 'SD (Template)',
      nomor: '1.1',
      rumpun: [],
      rincian: [],
      custom: {},
      position: { x: 0, y: 100 },
      collapsed: false,
      order: 0,
      isTemplate: true,
      kepalaUnit: { jenjangId: 'jpt_pratama', kebutuhan: 0, eksisting: 0 },
    },
    {
      id: 'guru-kelas',
      type: 'jabatan',
      nama: 'Guru Kelas',
      nomor: '1.1.1',
      kategoriId: 'fungsional',
      rumpun: ['keahlian'],
      rincian: [
        { id: 'r-ap', jenjangId: 'ahli_pertama', kebutuhan: 0, eksisting: 0 },
        { id: 'r-am', jenjangId: 'ahli_muda', kebutuhan: 0, eksisting: 0 },
      ],
      custom: {},
      position: { x: 0, y: 200 },
      collapsed: false,
      order: 0,
    },
  ];
  const edges = [
    { id: 'e1', source: 'root', target: 'sekolah', kind: 'hirarki' as const },
    { id: 'e2', source: 'sekolah', target: 'guru-kelas', kind: 'hirarki' as const },
  ];

  return {
    id: 'proj-matrix-import',
    schemaVersion: '1.0.0',
    configVersion: '2026.1',
    meta: { namaOPD: 'Dinas Pendidikan', kodeOPD: 'DISDIK', penyusun: 'Admin' },
    attributeSchema: [],
    nodes,
    edges,
    instances,
    viewport: { x: 0, y: 0, zoom: 1 },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

const twoInstances: UnitInstance[] = [
  {
    id: 'i1',
    templateNodeId: 'sekolah',
    nama: 'SDN 01 Kota Timur',
    kode: '20112233',
    figures: { sekolah: { kebutuhan: 1, eksisting: 1 }, 'r-ap': { kebutuhan: 4, eksisting: 3 }, 'r-am': { kebutuhan: 2, eksisting: 2 } },
  },
  {
    id: 'i2',
    templateNodeId: 'sekolah',
    nama: 'SDN 02 Kota Timur',
    figures: { sekolah: { kebutuhan: 1, eksisting: 0 }, 'r-ap': { kebutuhan: 5, eksisting: 5 }, 'r-am': { kebutuhan: 1, eksisting: 1 } },
  },
];

describe('Matrix round-trip via hidden-id row (M12.9, docs/15-template-instance.md §4, §7)', () => {
  it('export -> re-import reconstructs isTemplate, and instance figures exactly (kebutuhan/eksisting per column)', async () => {
    const original = makeSekolahProject(twoInstances);
    const recap = computeRecap(original, taxonomy);
    const blob = await exportXlsx(original, recap);
    const file = new File([blob], 'sekolah.xlsx');

    const preview = await processXlsxImport(file);

    expect(preview.canCommit).toBe(true);
    const sekolahNode = preview.built.nodes.find(n => n.nama === 'SD (Template)')!;
    expect(sekolahNode.isTemplate).toBe(true);
    // Baris di sheet Struktur tetap nol (invariant) — angka pindah ke instance
    expect(sekolahNode.kepalaUnit?.kebutuhan).toBe(0);
    const guruNode = preview.built.nodes.find(n => n.nama === 'Guru Kelas')!;
    expect(guruNode.rincian.every(r => r.kebutuhan === 0 && r.eksisting === 0)).toBe(true);

    expect(preview.built.instances).toHaveLength(2);
    const sdn01 = preview.built.instances!.find(i => i.nama === 'SDN 01 Kota Timur')!;
    expect(sdn01.templateNodeId).toBe(sekolahNode.id);
    expect(sdn01.kode).toBe('20112233');
    expect(sdn01.figures[sekolahNode.id]).toEqual({ kebutuhan: 1, eksisting: 1 });

    const guruRincianIds = guruNode.rincian.map(r => r.id);
    const apId = guruNode.rincian.find(r => r.jenjangId === 'ahli_pertama')!.id;
    const amId = guruNode.rincian.find(r => r.jenjangId === 'ahli_muda')!.id;
    expect(sdn01.figures[apId]).toEqual({ kebutuhan: 4, eksisting: 3 });
    expect(sdn01.figures[amId]).toEqual({ kebutuhan: 2, eksisting: 2 });
    expect(guruRincianIds).toHaveLength(2);
  });

  it('matrixSummaries reports instance count, column count, and totals for the sheet', async () => {
    const original = makeSekolahProject(twoInstances);
    const recap = computeRecap(original, taxonomy);
    const blob = await exportXlsx(original, recap);
    const file = new File([blob], 'sekolah.xlsx');

    const preview = await processXlsxImport(file);
    expect(preview.matrixSummaries).toHaveLength(1);
    const summary = preview.matrixSummaries![0];
    expect(summary.instanceCount).toBe(2);
    expect(summary.columnCount).toBe(3); // kepsek + 2 rincian
    expect(summary.totalKebutuhan).toBe(1 + 1 + 4 + 5 + 2 + 1); // sum semua kolom semua instance
  });

  it('300 instances round-trip exactly (doc 15 §7 exit criteria scale)', async () => {
    const many: UnitInstance[] = Array.from({ length: 300 }, (_, i) => ({
      id: `inst-${i}`,
      templateNodeId: 'sekolah',
      nama: `SDN ${String(i + 1).padStart(3, '0')}`,
      figures: {
        sekolah: { kebutuhan: 1, eksisting: i % 2 },
        'r-ap': { kebutuhan: 2, eksisting: 2 },
        'r-am': { kebutuhan: 1, eksisting: 1 },
      },
    }));
    const original = makeSekolahProject(many);
    const recap = computeRecap(original, taxonomy);
    const blob = await exportXlsx(original, recap);
    const file = new File([blob], 'sekolah-300.xlsx');

    const preview = await processXlsxImport(file);
    expect(preview.built.instances).toHaveLength(300);
    expect(preview.matrixSummaries![0].instanceCount).toBe(300);
  });
});

describe('Matrix import via label fallback (no hidden-id row — hand-built file)', () => {
  it('matches columns by group label + level text when the hidden row is stripped out', async () => {
    const original = makeSekolahProject(twoInstances);
    const recap = computeRecap(original, taxonomy);
    const blob = await exportXlsx(original, recap);
    const arrayBuffer = await blob.arrayBuffer();
    const wb = XLSX.read(arrayBuffer, { type: 'array' });

    // Simulasikan file "dibangun manual" oleh operator: hapus baris hidden-id
    // dari sheet matrix (baris 0), sisakan cuma 2 baris header + data.
    const matrixSheetName = wb.SheetNames.find(n => n.startsWith('Satuan_'))!;
    const sheet = wb.Sheets[matrixSheetName];
    const rows = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1 });
    const withoutHiddenRow = rows.slice(1); // buang baris 0 (hidden id)
    const newSheet = XLSX.utils.aoa_to_sheet(withoutHiddenRow);
    wb.Sheets[matrixSheetName] = newSheet;

    const rebuiltBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const file = new File([rebuiltBuffer], 'sekolah-hand-built.xlsx');

    const preview = await processXlsxImport(file);
    expect(preview.canCommit).toBe(true);
    expect(preview.built.instances).toHaveLength(2);

    const sekolahNode = preview.built.nodes.find(n => n.nama === 'SD (Template)')!;
    const guruNode = preview.built.nodes.find(n => n.nama === 'Guru Kelas')!;
    const apId = guruNode.rincian.find(r => r.jenjangId === 'ahli_pertama')!.id;

    const sdn01 = preview.built.instances!.find(i => i.nama === 'SDN 01 Kota Timur')!;
    expect(sdn01.figures[sekolahNode.id]).toEqual({ kebutuhan: 1, eksisting: 1 });
    expect(sdn01.figures[apId]).toEqual({ kebutuhan: 4, eksisting: 3 });

    // Tidak ada temuan unmatched-column palsu — label fallback berhasil penuh
    expect(preview.findings.filter(f => f.code === 'IMPORT_MATRIX_UNMATCHED_COLUMN')).toHaveLength(0);
  });
});

describe('Fatal-for-that-sheet-only (doc 15 §4)', () => {
  it('a matrix sheet whose nomor is absent from Struktur is skipped, but the rest of the import still commits', async () => {
    const original = makeSekolahProject(twoInstances);
    const recap = computeRecap(original, taxonomy);
    const blob = await exportXlsx(original, recap);
    const arrayBuffer = await blob.arrayBuffer();
    const wb = XLSX.read(arrayBuffer, { type: 'array' });

    // Ganti nama sheet matrix jadi nomor yang TIDAK ada di Struktur.
    const oldName = wb.SheetNames.find(n => n.startsWith('Satuan_'))!;
    XLSX.utils.book_append_sheet(wb, wb.Sheets[oldName], 'Satuan_9.9');
    delete wb.Sheets[oldName];
    wb.SheetNames = wb.SheetNames.filter(n => n !== oldName);

    const rebuiltBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const file = new File([rebuiltBuffer], 'sekolah-orphan-matrix.xlsx');

    const preview = await processXlsxImport(file);

    expect(preview.findings.some(f => f.code === 'IMPORT_MATRIX_TEMPLATE_NOT_FOUND')).toBe(true);
    // Struktur tetap valid & commit-able meski sheet matrix-nya gagal.
    expect(preview.canCommit).toBe(true);
    expect(preview.built.nodes.length).toBeGreaterThan(0);
    expect(preview.built.instances ?? []).toHaveLength(0);
  });
});
