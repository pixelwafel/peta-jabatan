import { describe, it, expect, beforeEach } from 'vitest';
import { Project } from '../src/models/project';
import { OrgNode } from '../src/models/node';
import { OrgEdge } from '../src/models/edge';
import {
  computeRecap,
  getRecapComputeCount,
  resetRecapComputeCount,
  recapKey,
} from '../src/selectors/recap';
import { taxonomy } from '../src/config/taxonomy';
import { useProjectStore } from '../src/store/projectStore';

describe('Recap Engine (Doc 07 Exit Criteria)', () => {
  beforeEach(() => {
    resetRecapComputeCount();
  });

  function createRecapFixture(): Project {
    const nodes: OrgNode[] = [
      {
        id: 'unit-root',
        type: 'unit',
        nama: 'Dinas Kesehatan',
        nomor: '1',
        rumpun: [],
        rincian: [], // Invariant 1: units have empty rincian!
        custom: {},
        position: { x: 0, y: 0 },
        collapsed: false,
      },
      {
        id: 'unit-sub',
        type: 'unit',
        nama: 'Sekretariat',
        nomor: '1.1',
        rumpun: [],
        rincian: [],
        custom: {},
        position: { x: 0, y: 100 },
        collapsed: false,
      },
      {
        id: 'jab-struct',
        type: 'jabatan',
        nama: 'Sekretaris',
        nomor: '1.1.1',
        kategoriId: 'struktural',
        rumpun: [],
        rincian: [{ id: 'r1', jenjangId: 'administrator', kebutuhan: 1, eksisting: 1 }],
        custom: {},
        position: { x: 0, y: 200 },
        collapsed: false,
      },
      {
        id: 'jab-fung',
        type: 'jabatan',
        nama: 'Analis Kepegawaian',
        nomor: '1.1.2',
        kategoriId: 'fungsional',
        rumpun: ['keahlian'],
        rincian: [
          { id: 'r2', jenjangId: 'ahli_muda', kebutuhan: 3, eksisting: 2 },
          { id: 'r3', jenjangId: 'ahli_pertama', kebutuhan: 2, eksisting: 2 },
        ],
        custom: {},
        position: { x: 50, y: 200 },
        collapsed: false,
      },
      {
        id: 'jab-pelaksana',
        type: 'jabatan',
        nama: 'Pengadministrasi Umum',
        nomor: '1.1.3',
        kategoriId: 'pelaksana',
        rumpun: [],
        rincian: [{ id: 'r4', jenjangId: null, kebutuhan: 4, eksisting: 3 }],
        custom: {},
        position: { x: 100, y: 200 },
        collapsed: false,
      },
      {
        id: 'jab-orphan',
        type: 'jabatan',
        nama: 'Staf Unplaced',
        nomor: '99',
        kategoriId: 'pelaksana',
        rumpun: [],
        rincian: [{ id: 'r5', jenjangId: null, kebutuhan: 2, eksisting: 1 }],
        custom: {},
        position: { x: 500, y: 500 },
        collapsed: false,
      },
    ];

    const edges: OrgEdge[] = [
      { id: 'e1', source: 'unit-root', target: 'unit-sub', kind: 'hirarki' },
      { id: 'e2', source: 'unit-sub', target: 'jab-struct', kind: 'hirarki' },
      { id: 'e3', source: 'unit-sub', target: 'jab-fung', kind: 'hirarki' },
      { id: 'e4', source: 'unit-sub', target: 'jab-pelaksana', kind: 'hirarki' },
    ];

    return {
      id: 'proj-recap',
      schemaVersion: '1.0.0',
      configVersion: '2026.1',
      meta: { namaOPD: 'Dinas Kesehatan', kodeOPD: 'DINKES', penyusun: 'Admin' },
      attributeSchema: [],
      nodes,
      edges,
      viewport: { x: 0, y: 0, zoom: 1 },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  it('unit node totals are always zero for every unit node (Invariant 1)', () => {
    const proj = createRecapFixture();
    const recap = computeRecap(proj, taxonomy);

    expect(recap.nodeTotals.get('unit-root')).toEqual({ kebutuhan: 0, eksisting: 0, selisih: 0 });
    expect(recap.nodeTotals.get('unit-sub')).toEqual({ kebutuhan: 0, eksisting: 0, selisih: 0 });
  });

  it('asserts sum(perKategori) === total - unplaced on mixed fixture', () => {
    const proj = createRecapFixture();
    const recap = computeRecap(proj, taxonomy);

    // Sum of perKategori
    let sumKeb = 0;
    let sumEks = 0;
    for (const kat of recap.perKategori) {
      sumKeb += kat.kebutuhan;
      sumEks += kat.eksisting;
    }

    const expectedKeb = recap.total.kebutuhan; // total - unplaced
    const expectedEks = recap.total.eksisting;

    // Must be EXACT identity!
    expect(sumKeb).toBe(expectedKeb);
    expect(sumEks).toBe(expectedEks);
    expect(recap.subtreeTotals.get('unit-root')?.kebutuhan).toBe(recap.total.kebutuhan);
  });

  it('zero-count categories appear in perKategori, zero-count levels do NOT appear in perJenjang', () => {
    const proj = createRecapFixture();
    const recap = computeRecap(proj, taxonomy);

    // Categories include all configured categories (struktural, fungsional, pelaksana)
    const katKeys = recap.perKategori.map(k => k.key);
    expect(katKeys).toContain('struktural');
    expect(katKeys).toContain('fungsional');
    expect(katKeys).toContain('pelaksana');

    // Levels only include used levels (ahli_muda, ahli_pertama, administrator)
    const jenjangKeys = recap.perJenjang.map(j => j.key);
    expect(jenjangKeys).toContain('ahli_muda');
    expect(jenjangKeys).toContain('ahli_pertama');
    expect(jenjangKeys).not.toContain('ahli_utama'); // Zero-count level excluded!
  });

  it('recap key ignores node position, name, and custom attributes (does not recompute on drag/description edits)', () => {
    const proj = createRecapFixture();
    const key1 = recapKey(proj);

    // Move node position and update name
    proj.nodes[0].position = { x: 999, y: 999 };
    proj.nodes[0].nama = 'Nama Baru';
    proj.nodes[0].custom = { note: 'test' };

    const key2 = recapKey(proj);

    // Key MUST remain identical!
    expect(key2).toBe(key1);
  });

  it('recap key changes when figures (rincian) or categories change', () => {
    const proj = createRecapFixture();
    const key1 = recapKey(proj);

    proj.nodes[3].rincian[0].kebutuhan = 99;

    const key2 = recapKey(proj);
    expect(key2).not.toBe(key1);
  });

  it('traversal terminates on cyclic fixture (visited set defense)', () => {
    const proj = createRecapFixture();
    // Introduce a cycle in edges (unit-sub -> unit-root)
    proj.edges.push({ id: 'e-cycle', source: 'unit-sub', target: 'unit-root', kind: 'hirarki' });

    // Traversal MUST terminate without stack overflow!
    expect(() => computeRecap(proj, taxonomy)).not.toThrow();
  });
});
