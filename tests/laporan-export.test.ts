import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { exportLaporan, buildLaporanPemerintahWorkbook, pctTerisi } from '../src/export/laporanExporter';
import { computeRecap } from '../src/selectors/recap';
import { taxonomy } from '../src/config/taxonomy';
import { Project } from '../src/models/project';
import { OrgNode } from '../src/models/node';
import { ProjectIndex, ProjectIndexEntry } from '../src/persistence/types';
import { OpdEntry, buildOpdIndex } from '../src/config/daftarOpd';

describe('pctTerisi', () => {
  it('computes rounded percentage, 0 when kebutuhan is 0', () => {
    expect(pctTerisi(10, 8)).toBe(80);
    expect(pctTerisi(3, 1)).toBe(33.3);
    expect(pctTerisi(0, 5)).toBe(0);
  });
});

function sheetRows(blob: Blob): Promise<(string | number)[][]> {
  return blob.arrayBuffer().then(buf => {
    const wb = XLSX.read(buf, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1 });
  });
}

describe('exportLaporan (fitur "Laporan" per-OPD, dibahas & disepakati dengan user)', () => {
  function makeFixtureProject(): Project {
    const root: OrgNode = {
      id: 'root',
      type: 'unit',
      nama: 'Dinas Contoh',
      nomor: '1',
      rumpun: [],
      rincian: [],
      custom: {},
      position: { x: 0, y: 0 },
      collapsed: false,
      order: 0,
      kepalaUnit: { jenjangId: 'jpt_pratama', kebutuhan: 1, eksisting: 1 },
    };
    const jabatan: OrgNode = {
      id: 'jab-1',
      type: 'jabatan',
      nama: 'Analis Kebijakan',
      nomor: '1.1',
      kategoriId: 'fungsional',
      rumpun: ['keahlian'],
      rincian: [{ id: 'r1', jenjangId: 'ahli_muda', kebutuhan: 3, eksisting: 2 }],
      custom: {},
      position: { x: 0, y: 0 },
      collapsed: false,
      order: 0,
    };
    return {
      id: 'proj-1',
      schemaVersion: '1.0.0',
      configVersion: '2026.1',
      meta: { namaOPD: 'Dinas Contoh', kodeOPD: 'DISCON', penyusun: 'Budi', tahunAnggaran: '2027' },
      attributeSchema: [],
      nodes: [root, jabatan],
      edges: [{ id: 'e1', source: 'root', target: 'jab-1', kind: 'hirarki' }],
      viewport: { x: 0, y: 0, zoom: 1 },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  it('includes a filled kop block (nama/kode OPD, tahun anggaran, penyusun)', async () => {
    const project = makeFixtureProject();
    const recap = computeRecap(project, taxonomy);
    const rows = await sheetRows(exportLaporan(project, recap));

    expect(rows[0][0]).toBe('LAPORAN REKAPITULASI KEBUTUHAN & EKSISTING PEGAWAI');
    expect(rows.find(r => r[0] === 'Nama OPD')?.[1]).toBe('Dinas Contoh');
    expect(rows.find(r => r[0] === 'Kode OPD')?.[1]).toBe('DISCON');
    expect(rows.find(r => r[0] === 'Tahun Anggaran')?.[1]).toBe('2027');
    expect(rows.find(r => r[0] === 'Disusun oleh')?.[1]).toBe('Budi');
  });

  it('ringkasan mencerminkan recap.total (kepala unit 1/1 + jabatan 3/2 = 4/3)', async () => {
    const project = makeFixtureProject();
    const recap = computeRecap(project, taxonomy);
    const rows = await sheetRows(exportLaporan(project, recap));

    expect(rows.find(r => r[0] === 'Total Kebutuhan')?.[1]).toBe(4);
    expect(rows.find(r => r[0] === 'Total Eksisting')?.[1]).toBe(3);
    expect(rows.find(r => r[0] === 'Selisih')?.[1]).toBe(-1);
    expect(rows.find(r => r[0] === '% Terisi')?.[1]).toBe('75%');
  });

  it('tabel per-kategori & per-jenjang berisi baris sesuai computeRecap', async () => {
    const project = makeFixtureProject();
    const recap = computeRecap(project, taxonomy);
    const rows = await sheetRows(exportLaporan(project, recap));

    const kategoriIdx = rows.findIndex(r => r[0] === 'REKAPITULASI PER KATEGORI');
    expect(kategoriIdx).toBeGreaterThan(-1);
    const fungsionalRow = rows.find(r => r[0] === 'Fungsional');
    expect(fungsionalRow).toEqual(['Fungsional', 3, 2, -1, '66.7%']);

    const jenjangIdx = rows.findIndex(r => r[0] === 'REKAPITULASI PER JENJANG');
    expect(jenjangIdx).toBeGreaterThan(-1);
  });

  it('tabel per-unit menyertakan baris root (dengan indentasi depth 0)', async () => {
    const project = makeFixtureProject();
    const recap = computeRecap(project, taxonomy);
    const rows = await sheetRows(exportLaporan(project, recap));

    const unitRow = rows.find(r => typeof r[0] === 'string' && r[0].includes('Dinas Contoh') && r[1] === 4);
    expect(unitRow).toBeDefined();
  });

  it('TIDAK menyertakan section Catatan kalau tidak ada unplaced/link basi', async () => {
    const project = makeFixtureProject();
    const recap = computeRecap(project, taxonomy);
    const rows = await sheetRows(exportLaporan(project, recap));

    expect(rows.some(r => r[0] === 'CATATAN')).toBe(false);
  });

  it('ringkasan menyertakan baris Catatan kalau ada jabatan unplaced (orphan, tanpa edge ke unit manapun)', async () => {
    const project = makeFixtureProject();
    const orphan: OrgNode = {
      id: 'jab-orphan',
      type: 'jabatan',
      nama: 'Pengadministrasi',
      nomor: '',
      kategoriId: 'pelaksana',
      rumpun: [],
      rincian: [{ id: 'r2', jenjangId: null, kebutuhan: 1, eksisting: 0 }],
      custom: {},
      position: { x: 0, y: 0 },
      collapsed: false,
      order: 0,
    };
    project.nodes.push(orphan);
    const recap = computeRecap(project, taxonomy);
    const rows = await sheetRows(exportLaporan(project, recap));

    // Unplaced dicatat sebagai baris "Catatan" di dalam section RINGKASAN
    // (bukan section "CATATAN" terpisah -- itu khusus link basi/cached).
    const catatanRow = rows.find(r => r[0] === 'Catatan');
    expect(catatanRow?.[1]).toContain('belum ditempatkan');
  });

  it('menyertakan blok pengesahan dengan nama penyusun', async () => {
    const project = makeFixtureProject();
    const recap = computeRecap(project, taxonomy);
    const rows = await sheetRows(exportLaporan(project, recap));

    expect(rows.some(r => r[0] === 'Mengetahui,')).toBe(true);
    expect(rows.some(r => typeof r[3] === 'string' && r[3].includes('Budi'))).toBe(true);
  });
});

describe('buildLaporanPemerintahWorkbook (fitur "Laporan" se-pemda)', () => {
  function entry(partial: Partial<ProjectIndexEntry> & Pick<ProjectIndexEntry, 'id' | 'kodeOPD'>): ProjectIndexEntry {
    return {
      namaOPD: partial.kodeOPD,
      nodeCount: 0,
      totalKebutuhan: 0,
      totalEksisting: 0,
      updatedAt: new Date().toISOString(),
      lastExportedAt: null,
      ...partial,
    };
  }

  function makeProject(id: string, kodeOPD: string): Project {
    const root: OrgNode = {
      id: `${id}-root`,
      type: 'unit',
      nama: kodeOPD,
      nomor: '1',
      rumpun: [],
      rincian: [],
      custom: {},
      position: { x: 0, y: 0 },
      collapsed: false,
      order: 0,
    };
    return {
      id,
      schemaVersion: '1.0.0',
      configVersion: '2026.1',
      meta: { namaOPD: kodeOPD, kodeOPD, penyusun: 'Admin' },
      attributeSchema: [],
      nodes: [root],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  it('ringkasan & tabel per-OPD reuse computeTopLevel double-count guard (linked child tidak dijumlah ulang)', async () => {
    const dinkes = entry({ id: 'dinkes', kodeOPD: 'DINKES', namaOPD: 'Dinas Kesehatan', totalKebutuhan: 500, totalEksisting: 420, linkedCodes: ['PKM1'] });
    const pkm1 = entry({ id: 'pkm1', kodeOPD: 'PKM1', namaOPD: 'Puskesmas 1', totalKebutuhan: 40, totalEksisting: 35 });

    const index: ProjectIndex = { version: 1, activeId: null, entries: [dinkes, pkm1] };
    const opdIndex = buildOpdIndex([{ kode: 'DINKES', nama: 'Dinas Kesehatan', kelompok: 'Dinas' } as OpdEntry]);
    const bodies = new Map<string, Project>([
      ['dinkes', makeProject('dinkes', 'DINKES')],
      ['pkm1', makeProject('pkm1', 'PKM1')],
    ]);
    const readProject = async (id: string) => bodies.get(id) ?? null;

    const blob = await buildLaporanPemerintahWorkbook(index, opdIndex, readProject);
    const rows = await sheetRows(blob);

    expect(rows[0][0]).toBe('LAPORAN REKAPITULASI KEBUTUHAN & EKSISTING PEGAWAI SE-PEMERINTAH DAERAH');
    // Hanya DINKES yang top-level -- total SE-PEMDA cuma 500, BUKAN 500+40=540.
    expect(rows.find(r => r[0] === 'Total Kebutuhan')?.[1]).toBe(500);
    expect(rows.find(r => r[0] === 'Jumlah OPD Tercatat')?.[1]).toBe(1);

    const opdRow = rows.find(r => r[0] === 'DINKES');
    expect(opdRow).toEqual(['DINKES', 'Dinas Kesehatan', 'Dinas', 500, 420, -80, '84%', 'Terkini']);
    // PKM1 tidak muncul lagi sebagai baris OPD top-level terpisah.
    expect(rows.some(r => r[0] === 'PKM1')).toBe(false);
  });

  it('menyertakan section Catatan kalau ada tautan ganda (doubleLinked)', async () => {
    const parentA = entry({ id: 'a', kodeOPD: 'A', linkedCodes: ['SHARED'] });
    const parentB = entry({ id: 'b', kodeOPD: 'B', linkedCodes: ['SHARED'] });
    const shared = entry({ id: 'shared', kodeOPD: 'SHARED' });

    const index: ProjectIndex = { version: 1, activeId: null, entries: [parentA, parentB, shared] };
    const opdIndex = buildOpdIndex([]);
    const bodies = new Map<string, Project>([
      ['a', makeProject('a', 'A')],
      ['b', makeProject('b', 'B')],
      ['shared', makeProject('shared', 'SHARED')],
    ]);
    const readProject = async (id: string) => bodies.get(id) ?? null;

    const blob = await buildLaporanPemerintahWorkbook(index, opdIndex, readProject);
    const rows = await sheetRows(blob);

    expect(rows.some(r => r[0] === 'CATATAN')).toBe(true);
  });
});
