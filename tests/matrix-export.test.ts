import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { buildMatrixSheets, buildMatrixSheet } from '../src/export/matrixExporter';
import { COLUMNS } from '../src/export/columnSpec';
import { buildExportRows } from '../src/export/rowGenerator';
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
    id: 'proj-matrix',
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

describe('buildMatrixSheet (M12.8, docs/15-template-instance.md §4)', () => {
  it('names the sheet Satuan_<nomor>', () => {
    const project = makeSekolahProject(twoInstances);
    const { name } = buildMatrixSheet(XLSX, project, project.nodes.find(n => n.id === 'sekolah')!);
    expect(name).toBe('Satuan_1.1');
  });

  it('produces a two-row header: group name (merged) then K/E or level·K/level·E sub-headers', () => {
    const project = makeSekolahProject(twoInstances);
    const { sheet } = buildMatrixSheet(XLSX, project, project.nodes.find(n => n.id === 'sekolah')!);
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, blankrows: true });

    // row index 1 = nama grup (0 = hidden id row)
    expect(rows[1]).toEqual(['satuan', 'kode', 'Kepala SD (Template)', '', 'Guru Kelas', '', '', '']);
    // row index 2 = sub-header K/E per kolom
    expect(rows[2]).toEqual(['', '', 'K', 'E', 'Ahli Pertama·K', 'Ahli Pertama·E', 'Ahli Muda·K', 'Ahli Muda·E']);

    // Merge Kepala SD (Template) TIDAK ada (cuma 1 kolom -> span 1, tak perlu merge);
    // Guru Kelas (2 kolom) harus merge 4 sel (AP-K,AP-E,AM-K,AM-E) di baris 1.
    const merges = sheet['!merges'] ?? [];
    expect(merges.some(m => m.s.r === 1 && m.s.c === 4 && m.e.c === 7)).toBe(true);
  });

  it('hides row 0 (the rincianId key row) so the sheet looks clean but re-import can still map columns exactly', () => {
    const project = makeSekolahProject(twoInstances);
    const { sheet } = buildMatrixSheet(XLSX, project, project.nodes.find(n => n.id === 'sekolah')!);
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });

    expect(rows[0]).toEqual(['', '', 'sekolah', 'sekolah', 'r-ap', 'r-ap', 'r-am', 'r-am']);
    expect(sheet['!rows']?.[0]?.hidden).toBe(true);
  });

  it('data rows carry instance nama/kode and per-column kebutuhan/eksisting figures', () => {
    const project = makeSekolahProject(twoInstances);
    const { sheet } = buildMatrixSheet(XLSX, project, project.nodes.find(n => n.id === 'sekolah')!);
    const rows = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1 });

    expect(rows[3]).toEqual(['SDN 01 Kota Timur', '20112233', 1, 1, 4, 3, 2, 2]);
    expect(rows[4]).toEqual(['SDN 02 Kota Timur', '', 1, 0, 5, 5, 1, 1]);
  });

  it('an empty instance list still produces a valid (headers-only) sheet', () => {
    const project = makeSekolahProject([]);
    const { sheet } = buildMatrixSheet(XLSX, project, project.nodes.find(n => n.id === 'sekolah')!);
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });
    expect(rows).toHaveLength(3); // cuma 3 baris header, tidak ada data
  });
});

describe('buildMatrixSheets — multiple side-by-side templates (doc 15 §6)', () => {
  it('produces one sheet per template unit in the project', () => {
    const project = makeSekolahProject(twoInstances);
    // Tambah template kedua berdampingan
    project.nodes.push({
      id: 'smp',
      type: 'unit',
      nama: 'SMP (Template)',
      nomor: '1.2',
      rumpun: [],
      rincian: [],
      custom: {},
      position: { x: 0, y: 0 },
      collapsed: false,
      order: 1,
      isTemplate: true,
    });
    project.edges.push({ id: 'e3', source: 'root', target: 'smp', kind: 'hirarki' });

    const sheets = buildMatrixSheets(XLSX, project);
    expect(sheets.map(s => s.name).sort()).toEqual(['Satuan_1.1', 'Satuan_1.2']);
  });
});

describe('Struktur sheet "template" marker column (doc 15 §4)', () => {
  it('marks every row inside a template subtree with the template unit\'s own nomor, and figures stay zero', () => {
    const project = makeSekolahProject(twoInstances);
    const recap = computeRecap(project, taxonomy);
    const rows = buildExportRows(project, recap, taxonomy);

    const templateCol = COLUMNS.find(c => c.key === 'template')!;
    const kebCol = COLUMNS.find(c => c.key === 'kebutuhan')!;

    const sekolahRow = rows.find(r => r.node.id === 'sekolah')!;
    const guruRows = rows.filter(r => r.node.id === 'guru-kelas');
    const rootRow = rows.find(r => r.node.id === 'root')!;

    expect(templateCol.get(sekolahRow)).toBe('1.1');
    for (const r of guruRows) {
      expect(templateCol.get(r)).toBe('1.1');
      // rincian mentah tetap nol di sheet Struktur (invariant) — angka
      // sebenarnya cuma ada di sheet Satuan_1.1, bukan di sini.
      expect(kebCol.get(r)).toBe(0);
    }
    expect(templateCol.get(rootRow)).toBe('');
  });
});
