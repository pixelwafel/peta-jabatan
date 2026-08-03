import { Project } from '@/models/project';
import { OrgNode } from '@/models/node';
import { OrgEdge } from '@/models/edge';

export function generate500NodeFixture(): Project {
  const nodes: OrgNode[] = [];
  const edges: OrgEdge[] = [];

  // Root node
  nodes.push({
    id: 'node-root',
    type: 'unit',
    nama: 'Dinas Sekretariat Daerah (500-Node Fixture)',
    nomor: '1',
    rumpun: [],
    rincian: [],
    custom: {},
    position: { x: 0, y: 0 },
    collapsed: false,
  });

  const CATEGORIES = ['struktural', 'fungsional', 'pelaksana'];
  const JENJANG_IDS = ['ahli_utama', 'ahli_madya', 'ahli_muda', 'ahli_pertama'];

  let count = 1;

  // 20 Division Unit nodes under root
  for (let d = 1; d <= 20; d++) {
    count++;
    const divId = `node-div-${d}`;
    nodes.push({
      id: divId,
      type: 'unit',
      nama: `Bidang Organisasi ${d}`,
      nomor: `1.${d}`,
      rumpun: [],
      rincian: [],
      custom: {},
      position: { x: (d - 10) * 300, y: 200 },
      collapsed: false,
    });

    edges.push({
      id: `edge-root-${d}`,
      source: 'node-root',
      target: divId,
      kind: 'hirarki',
    });

    // ~24 Position nodes under each division (20 * 24 = 480 positions -> 500 nodes total)
    const positionsPerDiv = d <= 19 ? 24 : 23;

    for (let p = 1; p <= positionsPerDiv; p++) {
      count++;
      const posId = `node-pos-${d}-${p}`;
      const catId = CATEGORIES[(d + p) % CATEGORIES.length];
      const isFungsional = catId === 'fungsional';

      nodes.push({
        id: posId,
        type: 'jabatan',
        nama: `Analis / Pengelola ${d}.${p}`,
        nomor: `1.${d}.${p}`,
        kategoriId: catId,
        rumpun: isFungsional ? ['keahlian'] : [],
        rincian: [
          {
            id: `rincian-${posId}-1`,
            jenjangId: isFungsional ? JENJANG_IDS[p % JENJANG_IDS.length] : null,
            kebutuhan: (p % 5) + 1,
            eksisting: (p % 5),
          },
        ],
        custom: {},
        position: { x: (d - 10) * 300 + (p - 12) * 20, y: 350 + p * 60 },
        collapsed: false,
      });

      edges.push({
        id: `edge-${divId}-${p}`,
        source: divId,
        target: posId,
        kind: 'hirarki',
      });
    }
  }

  return {
    id: 'proj-500-fixture',
    schemaVersion: '1.0.0',
    configVersion: '2026.1',
    meta: {
      namaOPD: 'Dinas Local Government 500-Node Fixture',
      kodeOPD: 'DIS-500',
      penyusun: 'Benchmark Generator',
    },
    attributeSchema: [],
    nodes,
    edges,
    viewport: { x: 0, y: 0, zoom: 0.5 },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
