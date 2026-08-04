import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { mapColumns } from '../src/import/columnMapper';
import { coerceInt, parseRows } from '../src/import/rowParser';
import { groupRows } from '../src/import/groupRows';
import { buildStructure } from '../src/import/buildStructure';
import { exportXlsx, exportXlsxTemplate } from '../src/export/xlsxExporter';
import { processXlsxImport } from '../src/import/xlsxImporter';
import { Project } from '../src/models/project';
import { OrgNode } from '../src/models/node';
import { OrgEdge } from '../src/models/edge';
import { computeRecap } from '../src/selectors/recap';
import { taxonomy } from '../src/config/taxonomy';
import { compareNomor } from '../src/utils/numbering';

describe('Import & Round-Trip Pipeline (Doc 08 Exit Criteria)', () => {
  it('mapColumns tolerantly matches historical aliases (status jabatan, bezetting, eselon, formasi)', () => {
    const headers = ['urutan', 'nama unit', 'jenis', 'status jabatan', 'eselon', 'formasi', 'bezetting'];
    const { map } = mapColumns(headers);

    expect(map.nomor).toBe(0);
    expect(map.nama).toBe(1);
    expect(map.tipe).toBe(2);
    expect(map.kategori).toBe(3);
    expect(map.jenjang).toBe(4);
    expect(map.kebutuhan).toBe(5);
    expect(map.eksisting).toBe(6);
  });

  it('coerceInt handles Indonesian thousand separators (1.234) and decimal commas (1,5)', () => {
    const findings: any[] = [];
    expect(coerceInt('1.234', 1, 'keb', findings)).toBe(1234);
    expect(coerceInt('1,5', 2, 'keb', findings)).toBe(2); // Rounded to integer with warning!
    expect(coerceInt('-', 3, 'keb', findings)).toBe(0);
    expect(coerceInt('', 4, 'keb', findings)).toBe(0);
  });

  it('groupRows merges rows sharing a nomor into one node candidate and unions rumpun', () => {
    const rawRows = [
      {
        rowNumber: 2,
        nomor: '1.1.1',
        nama: 'Analis Kepegawaian',
        tipe: 'Jabatan',
        kategori: 'Fungsional',
        rumpun: 'Keahlian',
        jenjang: 'Ahli Muda',
        kebutuhan: '2',
        eksisting: '1',
        custom: {},
      },
      {
        rowNumber: 3,
        nomor: '1.1.1',
        nama: 'Analis Kepegawaian',
        tipe: 'Jabatan',
        kategori: 'Fungsional',
        rumpun: 'Keterampilan',
        jenjang: 'Terampil',
        kebutuhan: '3',
        eksisting: '2',
        custom: {},
      },
    ];

    const { candidates } = groupRows(rawRows);
    expect(candidates.length).toBe(1);
    expect(candidates[0].nomor).toBe('1.1.1');
    expect(candidates[0].rincian.length).toBe(2);
    expect(candidates[0].rumpun).toContain('keahlian');
    expect(candidates[0].rumpun).toContain('keterampilan');
  });

  it('unit rows carrying figures are cleared (Invariant 1) and a warning is logged', () => {
    const rawRows = [
      {
        rowNumber: 2,
        nomor: '1.1',
        nama: 'Sekretariat',
        tipe: 'Unit',
        kebutuhan: '10',
        eksisting: '8',
        custom: {},
      },
    ];

    const { candidates, findings } = groupRows(rawRows);
    expect(candidates[0].rincian.length).toBe(0); // Cleared!
    expect(findings.some(f => f.code === 'IMPORT_UNIT_HAS_FIGURES')).toBe(true);
  });

  it('buildStructure connects missing parent gap (1.1.1 without 1.1) to nearest ancestor with a warning', () => {
    const candidates = [
      {
        nomor: '1',
        nama: 'Dinas',
        tipe: 'unit' as const,
        rumpun: [],
        rincian: [],
        custom: {},
        rowNumbers: [2],
      },
      {
        nomor: '1.1.1', // Gap: 1.1 is missing!
        nama: 'Staf Sub Bagian',
        tipe: 'jabatan' as const,
        rumpun: [],
        rincian: [],
        custom: {},
        rowNumbers: [3],
      },
    ];

    const { edges, findings } = buildStructure(candidates);
    expect(edges.length).toBe(1);
    expect(findings.some(f => f.code === 'IMPORT_PARENT_MISSING')).toBe(true);
  });

  it('1.10 sorts after 1.9, not after 1.1', () => {
    expect(compareNomor('1.10', '1.9')).toBeGreaterThan(0);
    expect(compareNomor('1.2', '1.10')).toBeLessThan(0);
  });

  it('Export -> Re-Import round trip produces equivalent structure on a 100-node fixture', async () => {
    // Generate 100-node project
    const nodes: OrgNode[] = [
      {
        id: 'u-root',
        type: 'unit',
        nama: 'Dinas Kesehatan',
        nomor: '1',
        rumpun: [],
        rincian: [],
        custom: {},
        position: { x: 0, y: 0 },
        collapsed: false,
      },
    ];

    const edges: OrgEdge[] = [];

    // Add 99 position nodes under root
    for (let i = 1; i <= 99; i++) {
      const id = `j-${i}`;
      const nomor = `1.${i}`;
      nodes.push({
        id,
        type: 'jabatan',
        nama: `Jabatan ${i}`,
        nomor,
        kategoriId: 'pelaksana',
        rumpun: [],
        rincian: [{ id: `r-${i}`, jenjangId: null, kebutuhan: i, eksisting: Math.max(0, i - 1) }],
        custom: {},
        position: { x: 0, y: 0 },
        collapsed: false,
      });
      edges.push({ id: `e-${i}`, source: 'u-root', target: id, kind: 'hirarki' });
    }

    const originalProject: Project = {
      id: 'proj-100',
      schemaVersion: '1.0.0',
      configVersion: '2026.1',
      meta: { namaOPD: 'Dinas Kesehatan', kodeOPD: 'DINKES', penyusun: 'Test' },
      attributeSchema: [],
      nodes,
      edges,
      viewport: { x: 0, y: 0, zoom: 1 },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // 1. Export to XLSX Blob
    const recap = computeRecap(originalProject, taxonomy);
    const xlsxBlob = exportXlsx(originalProject, recap);

    // 2. Re-import from XLSX Blob
    const file = new File([xlsxBlob], 'test_roundtrip.xlsx');
    const preview = await processXlsxImport(file);

    expect(preview.canCommit).toBe(true);
    expect(preview.built.nodes.length).toBe(100);
    expect(preview.built.edges.length).toBe(99);
    expect(preview.summary.totalKebutuhan).toBe(recap.total.kebutuhan);
  });

  it('exportXlsxTemplate produces a blank starter workbook that imports cleanly', async () => {
    const blob = exportXlsxTemplate();
    const file = new File([blob], 'template_peta_jabatan.xlsx');
    const preview = await processXlsxImport(file);

    expect(preview.canCommit).toBe(true);
    expect(preview.findings.filter(f => f.severity === 'error')).toHaveLength(0);
    expect(preview.summary.nodeCount).toBeGreaterThan(0);
    expect(preview.summary.unitCount).toBeGreaterThan(0);
    expect(preview.summary.jabatanCount).toBeGreaterThan(0);

    // Kategori & jenjang di baris contoh harus dikenali (bukan string mentah yang gagal resolve)
    const fungsional = preview.built.nodes.find(n => n.nama === 'Analis Kebijakan');
    expect(fungsional?.kategoriId).toBe('fungsional');
    expect(fungsional?.rincian[0]?.jenjangId).toBe('ahli_muda');

    // Kepala unit (struktural) melekat pada node Unit lewat kolom kepala_* —
    // BUKAN node Jabatan terpisah.
    const dinas = preview.built.nodes.find(n => n.nama === 'Dinas Contoh');
    expect(dinas?.kepalaUnit?.nama).toBe('Kepala Dinas Contoh');
    expect(dinas?.kepalaUnit?.jenjangId).toBe('jpt_pratama');
    expect(dinas?.kepalaUnit?.kebutuhan).toBe(1);

    // kepala_nama boleh kosong — pengguna tetap bisa isi kepala tanpa nama override
    const bidang = preview.built.nodes.find(n => n.nama === 'Bidang Contoh');
    expect(bidang?.kepalaUnit?.jenjangId).toBe('pengawas');
    expect(bidang?.kepalaUnit?.nama).toBeUndefined();

    // Tidak ada lagi node Jabatan berkategori struktural (format lama)
    const deprecatedStruktural = preview.built.nodes.filter(
      n => n.type === 'jabatan' && n.kategoriId === 'struktural'
    );
    expect(deprecatedStruktural).toHaveLength(0);
  });

  it('legacy XLSX format (kepala unit sebagai baris Jabatan struktural terpisah) tetap bisa diimpor, digabung otomatis ke kepalaUnit', async () => {
    const rows = [
      ['nomor', 'nama', 'tipe', 'kategori', 'jenjang', 'kebutuhan', 'eksisting'],
      ['1', 'Dinas Lama', 'Unit', '', '', '', ''],
      ['1.1', 'Sekretariat', 'Unit', '', '', '', ''],
      ['1.1.1', 'Sekretaris', 'Jabatan', 'Struktural', 'Administrator', 1, 1],
      ['1.1.2', 'Analis SDM', 'Jabatan', 'Fungsional', '', '', ''],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Struktur');
    const arrayBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const file = new File([arrayBuffer], 'legacy.xlsx');

    const preview = await processXlsxImport(file);

    expect(preview.canCommit).toBe(true);
    // Node "Sekretaris" harus lenyap sebagai node Jabatan — datanya lipat ke unit induk
    expect(preview.built.nodes.find(n => n.nama === 'Sekretaris')).toBeUndefined();

    const sekretariat = preview.built.nodes.find(n => n.nama === 'Sekretariat');
    expect(sekretariat?.kepalaUnit?.jenjangId).toBe('administrator');
    expect(sekretariat?.kepalaUnit?.kebutuhan).toBe(1);

    // Jabatan non-struktural yang tadinya adik "Sekretaris" tetap anak Sekretariat
    const analis = preview.built.nodes.find(n => n.nama === 'Analis SDM');
    expect(analis).toBeDefined();
  });
});
