import { describe, it, expect } from 'vitest';
import { Project } from '../src/models/project';
import { OrgNode } from '../src/models/node';
import { OrgEdge } from '../src/models/edge';
import { UnitInstance } from '../src/models/project';
import { computeRecap } from '../src/selectors/recap';
import { taxonomy } from '../src/config/taxonomy';

/**
 * Fixture "sekolah" (docs/15-template-instance.md §2 contoh grid):
 * root -> sekolah (isTemplate, kepalaUnit "Kepsek") -> guru-kelas (jabatan,
 * dua rincian: Ahli Pertama & Ahli Muda). 2 instance (SDN 01, SDN 02).
 */
function createTemplateFixture(instances: UnitInstance[]): Project {
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
      // Kepsek — figures-nya HARUS nol (invariant), angka nyata di instance
      // keyed pakai id unit ini sendiri ('sekolah').
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
        { id: 'r-ahli-pertama', jenjangId: 'ahli_pertama', kebutuhan: 0, eksisting: 0 }, // invariant: nol
        { id: 'r-ahli-muda', jenjangId: 'ahli_muda', kebutuhan: 0, eksisting: 0 },
      ],
      custom: {},
      position: { x: 0, y: 200 },
      collapsed: false,
      order: 0,
    },
  ];
  const edges: OrgEdge[] = [
    { id: 'e1', source: 'root', target: 'sekolah', kind: 'hirarki' },
    { id: 'e2', source: 'sekolah', target: 'guru-kelas', kind: 'hirarki' },
  ];

  return {
    id: 'proj-template',
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
    figures: {
      sekolah: { kebutuhan: 1, eksisting: 1 }, // Kepsek
      'r-ahli-pertama': { kebutuhan: 4, eksisting: 3 },
      'r-ahli-muda': { kebutuhan: 2, eksisting: 2 },
    },
  },
  {
    id: 'i2',
    templateNodeId: 'sekolah',
    nama: 'SDN 02 Kota Timur',
    figures: {
      sekolah: { kebutuhan: 1, eksisting: 0 },
      'r-ahli-pertama': { kebutuhan: 5, eksisting: 5 },
      'r-ahli-muda': { kebutuhan: 1, eksisting: 1 },
    },
  },
];

describe('computeRecap — template-instance aggregation (M12.2, docs/15-template-instance.md §3)', () => {
  it('nodeTotals for a template-subtree position sums instance figures per rincianId, not stored rincian (invariant: rows stay zero)', () => {
    const recap = computeRecap(createTemplateFixture(twoInstances), taxonomy);
    // Guru Kelas: Ahli Pertama 4+5=9/3+5=8, Ahli Muda 2+1=3/2+1=3 -> total 12/11
    expect(recap.nodeTotals.get('guru-kelas')).toEqual({ kebutuhan: 12, eksisting: 11, selisih: -1 });
  });

  it('nodeTotals for the template unit itself sums the Kepsek column (kepalaUnit figures stay zero on the node)', () => {
    const recap = computeRecap(createTemplateFixture(twoInstances), taxonomy);
    expect(recap.nodeTotals.get('sekolah')).toEqual({ kebutuhan: 2, eksisting: 1, selisih: -1 });
  });

  it('subtreeTotals(template unit) = Kepsek + Guru Kelas column totals (doc 15 §3 formula)', () => {
    const recap = computeRecap(createTemplateFixture(twoInstances), taxonomy);
    // 2/1 (Kepsek) + 12/11 (Guru Kelas) = 14/12
    expect(recap.subtreeTotals.get('sekolah')).toEqual({ kebutuhan: 14, eksisting: 12, selisih: -2 });
    expect(recap.total.kebutuhan).toBe(14); // naik sampai ke root
    expect(recap.total.eksisting).toBe(12);
  });

  it('perUnit row for a template unit shows instance count as nodeCount, flagged isTemplateUnit ("N satuan", doc 15 §3)', () => {
    const recap = computeRecap(createTemplateFixture(twoInstances), taxonomy);
    const bucket = recap.perUnit.find(u => u.key === 'sekolah')!;
    expect(bucket.nodeCount).toBe(2); // 2 satuan, BUKAN jumlah posisi
    expect(bucket.isTemplateUnit).toBe(true);
  });

  it('per-jenjang recap stays exact per rincianId (two-level Guru columns, exit criteria doc 15 §7)', () => {
    const recap = computeRecap(createTemplateFixture(twoInstances), taxonomy);
    const ahliPertama = recap.perJenjang.find(j => j.key === 'ahli_pertama')!;
    const ahliMuda = recap.perJenjang.find(j => j.key === 'ahli_muda')!;
    expect(ahliPertama).toEqual(expect.objectContaining({ kebutuhan: 9, eksisting: 8 }));
    expect(ahliMuda).toEqual(expect.objectContaining({ kebutuhan: 3, eksisting: 3 }));
  });

  it('perKategori folds the Kepsek column under "struktural" via nodeTotals (already instance-aware)', () => {
    const recap = computeRecap(createTemplateFixture(twoInstances), taxonomy);
    const struktural = recap.perKategori.find(k => k.key === 'struktural')!;
    expect(struktural.kebutuhan).toBe(2);
    expect(struktural.eksisting).toBe(1);
  });

  it('with zero instances, every template-subtree total is zero (no crash, no stale figures)', () => {
    const recap = computeRecap(createTemplateFixture([]), taxonomy);
    expect(recap.subtreeTotals.get('sekolah')).toEqual({ kebutuhan: 0, eksisting: 0, selisih: 0 });
    const bucket = recap.perUnit.find(u => u.key === 'sekolah')!;
    expect(bucket.nodeCount).toBe(0);
  });

  it('a column keyed to a deleted rincianId (orphan figure) does not silently inflate totals for a still-existing row', () => {
    const orphanInstances: UnitInstance[] = [
      {
        id: 'i1',
        templateNodeId: 'sekolah',
        nama: 'SDN 01',
        figures: {
          sekolah: { kebutuhan: 1, eksisting: 1 },
          'r-ahli-pertama': { kebutuhan: 4, eksisting: 3 },
          'r-jenjang-terhapus': { kebutuhan: 99, eksisting: 99 }, // rincianId sudah tak ada di node
        },
      },
    ];
    const recap = computeRecap(createTemplateFixture(orphanInstances), taxonomy);
    // guru-kelas cuma py 2 rincian (r-ahli-pertama, r-ahli-muda) — kolom orphan
    // tidak pernah dibaca karena loop iterasi n.rincian, bukan seluruh figures.
    expect(recap.nodeTotals.get('guru-kelas')).toEqual({ kebutuhan: 4, eksisting: 3, selisih: -1 });
  });
});
