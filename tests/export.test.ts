import { describe, it, expect } from 'vitest';
import { Project } from '../src/models/project';
import { OrgNode } from '../src/models/node';
import { OrgEdge } from '../src/models/edge';
import { COLUMNS, getCustomColumns } from '../src/export/columnSpec';
import { buildExportRows } from '../src/export/rowGenerator';
import { exportFilename } from '../src/export/filename';
import { computeRecap } from '../src/selectors/recap';
import { exportCsv } from '../src/export/csvExporter';
import { exportJson } from '../src/export/jsonExporter';
import { taxonomy } from '../src/config/taxonomy';

describe('Export Pipeline (Doc 09 Exit Criteria)', () => {
  function createExportFixture(): Project {
    const nodes: OrgNode[] = [
      {
        id: 'unit-root',
        type: 'unit',
        nama: 'Dinas Pariwisata',
        nomor: '1',
        rumpun: [],
        rincian: [],
        custom: {},
        position: { x: 0, y: 0 },
        collapsed: false,
      },
      {
        id: 'jab-empty',
        type: 'jabatan',
        nama: 'Jabatan Tanpa Row',
        nomor: '1.1',
        kategoriId: 'pelaksana',
        rumpun: [],
        rincian: [], // 0 detail rows!
        custom: {},
        position: { x: 0, y: 100 },
        collapsed: false,
      },
      {
        id: 'jab-with-rows',
        type: 'jabatan',
        nama: 'Penyuluh Wisata',
        nomor: '1.2',
        kategoriId: 'fungsional',
        rumpun: ['keahlian'],
        rincian: [
          { id: 'r1', jenjangId: 'ahli_muda', kebutuhan: 2, eksisting: 2 },
          { id: 'r2', jenjangId: 'ahli_pertama', kebutuhan: 3, eksisting: 1 },
        ],
        custom: {},
        position: { x: 100, y: 100 },
        collapsed: false,
      },
    ];

    const edges: OrgEdge[] = [
      { id: 'e1', source: 'unit-root', target: 'jab-empty', kind: 'hirarki' },
      { id: 'e2', source: 'unit-root', target: 'jab-with-rows', kind: 'hirarki' },
    ];

    return {
      id: 'proj-export',
      schemaVersion: '1.0.0',
      configVersion: '2026.1',
      meta: { namaOPD: 'Dinas Pariwisata', kodeOPD: 'DISPAR', penyusun: 'Admin' },
      attributeSchema: [{ id: 'sub_lokasi', nama: 'Sub Lokasi', tipe: 'text' }],
      nodes,
      edges,
      viewport: { x: 0, y: 0, zoom: 1 },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  it('COLUMNS contains all 22 core column definitions plus custom attributes', () => {
    expect(COLUMNS.length).toBe(22);
    const keys = COLUMNS.map(c => c.key);
    expect(keys).toContain('nomor');
    expect(keys).toContain('nama');
    expect(keys).toContain('kebutuhan');
    expect(keys).toContain('eksisting');
    expect(keys).toContain('selisih');
    // Kepala unit (struktural) melekat pada node Unit, bukan node Jabatan
    // terpisah — lihat models/node.ts KepalaUnit.
    expect(keys).toContain('kepala_nama');
    expect(keys).toContain('kepala_kode');
    expect(keys).toContain('kepala_jenjang');
    expect(keys).toContain('kepala_kebutuhan');
    expect(keys).toContain('kepala_eksisting');
    // Template-instance (docs/15-template-instance.md §4)
    expect(keys).toContain('template');
    // Link node (docs/13-link-nodes.md §6)
    expect(keys).toContain('kode_tautan');

    const customCols = getCustomColumns([{ id: 'sub_lokasi', nama: 'Sub Lokasi', tipe: 'text' }]);
    expect(customCols.length).toBe(1);
    expect(customCols[0].key).toBe('sub_lokasi');
  });

  it('buildExportRows emits unit row, empty position row, and detailed rows correctly', () => {
    const proj = createExportFixture();
    const recap = computeRecap(proj, taxonomy);
    const rows = buildExportRows(proj, recap, taxonomy);

    // Expected rows:
    // 1. unit-root (1 row)
    // 2. jab-empty (1 row with rincian = null, preserving node on export!)
    // 3. jab-with-rows (2 rows for the 2 rincian)
    expect(rows.length).toBe(4);

    expect(rows[0].node.id).toBe('unit-root');
    expect(rows[0].rincian).toBeNull();
    expect(rows[0].totals.kebutuhan).toBe(5); // Subtree aggregate kebutuhan (2 + 3)

    expect(rows[1].node.id).toBe('jab-empty');
    expect(rows[1].rincian).toBeNull();

    expect(rows[2].node.id).toBe('jab-with-rows');
    expect(rows[2].rincian?.jenjangId).toBe('ahli_muda');

    expect(rows[3].node.id).toBe('jab-with-rows');
    expect(rows[3].rincian?.jenjangId).toBe('ahli_pertama');
  });

  it('exportFilename formats slugified agency code, name, and date', () => {
    const proj = createExportFixture();
    const filename = exportFilename(proj, 'xlsx');

    const dateStr = new Date().toISOString().slice(0, 10);
    expect(filename).toBe(`peta-jabatan_dispar_dinas-pariwisata_${dateStr}.xlsx`);
  });

  it('exportCsv outputs UTF-8 string starting with BOM and CRLF line breaks', async () => {
    const proj = createExportFixture();
    const recap = computeRecap(proj, taxonomy);
    const blob = exportCsv(proj, recap, ',');

    const text = await blob.text();
    expect(text.startsWith('\uFEFF')).toBe(true); // BOM check!
    expect(text).toContain('\r\n');
    expect(text).toContain('nomor,nama,tipe,kategori');
    expect(text).toContain('Dinas Pariwisata');
  });

  it('exportJson outputs valid JSON matching project structure', async () => {
    const proj = createExportFixture();
    const blob = exportJson(proj);

    const text = await blob.text();
    const parsed = JSON.parse(text);

    expect(parsed.id).toBe(proj.id);
    expect(parsed.nodes.length).toBe(proj.nodes.length);
  });

  it('exportJson carries link verbatim (docs/13-link-nodes.md §6 — file self-sufficient)', async () => {
    const proj = createExportFixture();
    proj.nodes.push({
      id: 'unit-link',
      type: 'unit',
      nama: 'Puskesmas Kota Timur',
      nomor: '1.3',
      rumpun: [],
      rincian: [],
      custom: {},
      position: { x: 0, y: 0 },
      collapsed: false,
      order: 2,
      link: {
        kodeOPD: 'PKM-KTIM',
        namaProject: 'Puskesmas Kota Timur',
        cached: { kebutuhan: 52, eksisting: 47, nodeCount: 41, updatedAt: '2026-07-14T00:00:00.000Z' },
      },
    });

    const blob = exportJson(proj);
    const parsed = JSON.parse(await blob.text());
    const linkNode = parsed.nodes.find((n: OrgNode) => n.id === 'unit-link');

    expect(linkNode.link).toEqual({
      kodeOPD: 'PKM-KTIM',
      namaProject: 'Puskesmas Kota Timur',
      cached: { kebutuhan: 52, eksisting: 47, nodeCount: 41, updatedAt: '2026-07-14T00:00:00.000Z' },
    });
  });

  it('a link node exports as a single "Tautan" row with kode_tautan and resolved totals', () => {
    const proj = createExportFixture();
    proj.nodes.push({
      id: 'unit-link',
      type: 'unit',
      nama: 'Puskesmas Kota Timur',
      nomor: '1.3',
      rumpun: [],
      rincian: [],
      custom: {},
      position: { x: 0, y: 0 },
      collapsed: false,
      order: 2,
      link: {
        kodeOPD: 'PKM-KTIM',
        namaProject: 'Puskesmas Kota Timur',
        cached: { kebutuhan: 0, eksisting: 0, nodeCount: 0, updatedAt: '' },
      },
    });

    const index = {
      version: 1 as const,
      activeId: null,
      entries: [
        {
          id: 'target',
          namaOPD: 'Puskesmas Kota Timur',
          kodeOPD: 'PKM-KTIM',
          nodeCount: 41,
          totalKebutuhan: 52,
          totalEksisting: 47,
          updatedAt: '2026-07-14T00:00:00.000Z',
          lastExportedAt: null,
        },
      ],
    };

    const recap = computeRecap(proj, taxonomy, index);
    const rows = buildExportRows(proj, recap, taxonomy);
    const linkRow = rows.find(r => r.node.id === 'unit-link')!;

    const tipeCol = COLUMNS.find(c => c.key === 'tipe')!;
    const kodeTautanCol = COLUMNS.find(c => c.key === 'kode_tautan')!;
    const kebutuhanCol = COLUMNS.find(c => c.key === 'kebutuhan')!;
    const eksistingCol = COLUMNS.find(c => c.key === 'eksisting')!;

    expect(tipeCol.get(linkRow)).toBe('Tautan');
    expect(kodeTautanCol.get(linkRow)).toBe('PKM-KTIM');
    expect(kebutuhanCol.get(linkRow)).toBe(52);
    expect(eksistingCol.get(linkRow)).toBe(47);
  });
});
