import { Project, UnitInstance } from '@/models/project';
import { OrgNode } from '@/models/node';
import { OrgEdge } from '@/models/edge';
import { ProjectIndex, ProjectIndexEntry } from '@/persistence/types';

/**
 * Fixture 500 node yang dipakai tests/performance-canvas.test.ts.
 * SENGAJA tidak dijadikan wrapper `generateFixture` — test itu merujuk id
 * literal `node-pos-1-1`, dan id di sini memang pendek/non-UUID. Untuk
 * benchmark yang butuh ukuran serialisasi realistis, pakai `generateFixture`.
 */
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
    order: 0,
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
      order: d - 1,
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
        order: p - 1,
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

// ---------------------------------------------------------------------------
// Fase 0.1 — fixture generator berparameter untuk uji performa/skala.
// Deterministik (LCG ber-seed, timestamp tetap) supaya hasil benchmark bisa
// dibandingkan antar-run, dan id sepanjang UUID supaya ukuran serialisasi
// merepresentasikan data nyata (~537 byte/node+edge, bukan ~320 byte kalau
// pakai id pendek seperti 'node-pos-1-1').
// ---------------------------------------------------------------------------

const FIXED_TIMESTAMP = '2026-01-01T00:00:00.000Z';

/** LCG (Numerical Recipes) — cukup untuk fixture, jangan dipakai untuk kripto. */
function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

/** UUID v4-shaped tapi deterministik dari RNG ber-seed (bukan crypto-random). */
function seededUuid(rng: () => number): string {
  const hex = (n: number) => Math.floor(n * 16).toString(16);
  const bytes = Array.from({ length: 32 }, () => hex(rng()));
  bytes[12] = '4';
  bytes[16] = ((parseInt(bytes[16], 16) & 0x3) | 0x8).toString(16);
  const s = bytes.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

export interface FixtureOptions {
  /** Jumlah node total (mendekati; dibulatkan ke bawah ke kelipatan branching). */
  nodes: number;
  /** Jumlah anak per unit non-daun. Default 8. */
  branching?: number;
  /** Kedalaman pohon unit sebelum daun jabatan ditempatkan. Default 3. */
  depth?: number;
  templates?: number;
  instancesPerTemplate?: number;
  links?: number;
  seed?: number;
}

const FIXTURE_CATEGORIES = ['struktural', 'fungsional', 'pelaksana'];
const FIXTURE_JENJANG_IDS = ['ahli_utama', 'ahli_madya', 'ahli_muda', 'ahli_pertama'];

/**
 * Generator fixture berparameter untuk benchmark skala besar (tests/performance-*).
 * Berbeda dari generate500NodeFixture: id UUID-length + timestamp tetap supaya
 * deterministik dan mewakili ukuran data nyata.
 */
export function generateFixture(opts: FixtureOptions): Project {
  const branching = opts.branching ?? 8;
  const depth = opts.depth ?? 3;
  const rng = makeRng(opts.seed ?? 1);

  const nodes: OrgNode[] = [];
  const edges: OrgEdge[] = [];

  const rootId = seededUuid(rng);
  nodes.push({
    id: rootId,
    type: 'unit',
    nama: 'Dinas Fixture Root',
    nomor: '1',
    rumpun: [],
    rincian: [],
    custom: {},
    position: { x: 0, y: 0 },
    collapsed: false,
    order: 0,
  });

  let created = 1;
  let leafCounter = 0;

  // Bangun pohon unit sampai `depth`, lalu isi sisa kuota dengan node jabatan
  // sebagai daun di bawah unit level-terakhir (round-robin).
  const unitLevels: string[][] = [[rootId]];
  for (let level = 1; level < depth && created < opts.nodes; level++) {
    const parents = unitLevels[level - 1];
    const currentLevel: string[] = [];
    for (const parentId of parents) {
      for (let b = 0; b < branching && created < opts.nodes; b++) {
        const id = seededUuid(rng);
        nodes.push({
          id,
          type: 'unit',
          nama: `Unit L${level}.${currentLevel.length + 1}`,
          nomor: `1.${currentLevel.length + 1}`,
          rumpun: [],
          rincian: [],
          custom: {},
          position: { x: 0, y: 0 },
          collapsed: false,
          order: currentLevel.length,
        });
        edges.push({ id: seededUuid(rng), source: parentId, target: id, kind: 'hirarki' });
        currentLevel.push(id);
        created++;
      }
    }
    unitLevels.push(currentLevel);
    if (currentLevel.length === 0) break;
  }

  const leafParents = unitLevels[unitLevels.length - 1];
  let parentIdx = 0;
  while (created < opts.nodes && leafParents.length > 0) {
    const parentId = leafParents[parentIdx % leafParents.length];
    parentIdx++;
    leafCounter++;
    const catId = FIXTURE_CATEGORIES[leafCounter % FIXTURE_CATEGORIES.length];
    const isFungsional = catId === 'fungsional';
    const id = seededUuid(rng);
    nodes.push({
      id,
      type: 'jabatan',
      nama: `Analis / Pengelola ${leafCounter}`,
      nomor: `1.${leafCounter}`,
      kategoriId: catId,
      rumpun: isFungsional ? ['keahlian'] : [],
      rincian: [
        {
          id: seededUuid(rng),
          jenjangId: isFungsional ? FIXTURE_JENJANG_IDS[leafCounter % FIXTURE_JENJANG_IDS.length] : null,
          kebutuhan: (leafCounter % 5) + 1,
          eksisting: leafCounter % 5,
        },
      ],
      custom: {},
      position: { x: 0, y: 0 },
      collapsed: false,
      order: leafCounter - 1,
    });
    edges.push({ id: seededUuid(rng), source: parentId, target: id, kind: 'hirarki' });
    created++;
  }

  // Template + instance opsional (docs/15-template-instance.md).
  const instances: UnitInstance[] = [];
  if (opts.templates && opts.templates > 0) {
    const templateCandidates = nodes.filter(n => n.type === 'unit' && n.id !== rootId).slice(0, opts.templates);
    for (const t of templateCandidates) {
      t.isTemplate = true;
      const count = opts.instancesPerTemplate ?? 1;
      for (let i = 0; i < count; i++) {
        instances.push({
          id: seededUuid(rng),
          templateNodeId: t.id,
          nama: `Instance ${i + 1}`,
          figures: {},
        });
      }
    }
  }

  // Link node opsional (docs/13-link-nodes.md) — hanya metadata link, tanpa
  // project lain sungguhan (cukup untuk uji volume/serialisasi).
  if (opts.links && opts.links > 0) {
    const candidates = nodes.filter(n => n.type === 'unit' && !n.isTemplate).slice(0, opts.links);
    for (const c of candidates) {
      c.link = {
        kodeOPD: `LINK-${c.id.slice(0, 8)}`,
        namaProject: `Project Tertaut ${c.id.slice(0, 8)}`,
        cached: { kebutuhan: 0, eksisting: 0, nodeCount: 0, updatedAt: FIXED_TIMESTAMP },
      };
    }
  }

  return {
    id: seededUuid(rng),
    schemaVersion: '1.0.0',
    configVersion: '2026.1',
    meta: {
      namaOPD: `Dinas Fixture ${opts.nodes}-Node`,
      kodeOPD: `FIX-${opts.nodes}`,
      penyusun: 'Benchmark Generator',
    },
    attributeSchema: [],
    nodes,
    edges,
    instances: instances.length > 0 ? instances : undefined,
    viewport: { x: 0, y: 0, zoom: 0.5 },
    createdAt: FIXED_TIMESTAMP,
    updatedAt: FIXED_TIMESTAMP,
  };
}

/**
 * Fixture index + body untuk uji skenario "ratusan OPD" (dashboard, laporan
 * se-pemda, rebuildIndexFromStorage). `bodies` diurutkan sama dengan
 * `index.entries` supaya pemetaan id konsisten untuk caller test.
 */
export function generateIndexFixture(
  opdCount: number,
  nodesPerOpd: number
): { index: ProjectIndex; bodies: Project[] } {
  const bodies: Project[] = [];
  const entries: ProjectIndexEntry[] = [];

  for (let i = 0; i < opdCount; i++) {
    const project = generateFixture({ nodes: nodesPerOpd, seed: 1000 + i });
    project.meta.namaOPD = `Dinas Fixture OPD ${i + 1}`;
    project.meta.kodeOPD = `OPD-${String(i + 1).padStart(3, '0')}`;
    bodies.push(project);

    const posCount = project.nodes.filter(n => n.type === 'jabatan').length;
    const totals = project.nodes.reduce(
      (acc, n) => {
        for (const r of n.rincian) {
          acc.kebutuhan += r.kebutuhan;
          acc.eksisting += r.eksisting;
        }
        return acc;
      },
      { kebutuhan: 0, eksisting: 0 }
    );

    entries.push({
      id: project.id,
      namaOPD: project.meta.namaOPD,
      kodeOPD: project.meta.kodeOPD,
      nodeCount: posCount,
      totalKebutuhan: totals.kebutuhan,
      totalEksisting: totals.eksisting,
      updatedAt: FIXED_TIMESTAMP,
      lastExportedAt: null,
      origin: 'created',
      linkedCodes: [],
      findingCounts: { errors: 0, warnings: 0 },
    });
  }

  return {
    index: { version: 1, activeId: entries[0]?.id ?? null, entries },
    bodies,
  };
}
