import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAnalysisWorkerClient } from '../src/workers/client';
import { validateProject } from '../src/selectors/validation';
import { computeRecap } from '../src/selectors/recap';
import { Project } from '../src/models/project';
import { OrgNode } from '../src/models/node';
import { ProjectIndexEntry } from '../src/persistence/types';
import * as storage from '../src/persistence/storage';

// Fase 2.2 — Vitest jalan dengan `environment: 'node'` (vite.config.ts), jadi
// `typeof Worker === 'undefined'` selalu true di sini: setiap panggilan
// client otomatis lewat jalur inline (createInlineClient), memanggil fungsi
// murni yang sama yang dipanggil worker sungguhan di browser. Suite ini
// memverifikasi jalur itu menghasilkan angka identik dengan pemanggilan
// selector langsung, dan bahwa globalBreakdown tetap bisa dibatalkan.

function makeProject(id: string): Project {
  const nodes: OrgNode[] = [
    {
      id: 'root',
      type: 'unit',
      nama: 'Root',
      nomor: '1',
      rumpun: [],
      rincian: [],
      custom: {},
      position: { x: 0, y: 0 },
      collapsed: false,
      order: 0,
    },
    {
      id: 'j1',
      type: 'jabatan',
      nama: 'Jabatan',
      nomor: '1.1',
      kategoriId: 'pelaksana',
      rumpun: [],
      rincian: [{ id: 'r1', jenjangId: null, kebutuhan: 3, eksisting: 2 }],
      custom: {},
      position: { x: 0, y: 0 },
      collapsed: false,
      order: 0,
    },
  ];
  return {
    id,
    schemaVersion: '1.0.0',
    configVersion: '2026.1',
    meta: { namaOPD: id, kodeOPD: id, penyusun: 'Admin' },
    attributeSchema: [],
    nodes,
    edges: [{ id: 'e1', source: 'root', target: 'j1', kind: 'hirarki' }],
    viewport: { x: 0, y: 0, zoom: 1 },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function indexEntry(id: string): ProjectIndexEntry {
  return {
    id,
    namaOPD: id,
    kodeOPD: id,
    nodeCount: 1,
    totalKebutuhan: 0,
    totalEksisting: 0,
    updatedAt: new Date().toISOString(),
    lastExportedAt: null,
  };
}

describe('workers/client.ts inline fallback (Fase 2.2)', () => {
  it('typeof Worker is undefined in the Vitest node environment (fallback branch is the one under test)', () => {
    expect(typeof Worker).toBe('undefined');
  });

  it('validate() matches calling validateProject directly', async () => {
    const project = makeProject('a');
    const client = createAnalysisWorkerClient();
    const viaClient = await client.validate(project);
    const direct = validateProject(project);
    expect(viaClient).toEqual(direct);
    client.terminate();
  });

  it('recap() matches calling computeRecap directly', async () => {
    const project = makeProject('a');
    const client = createAnalysisWorkerClient();
    const viaClient = await client.recap(project);
    const direct = computeRecap(project);
    expect(viaClient.total).toEqual(direct.total);
    client.terminate();
  });

  it('indexEntry() produces a well-formed ProjectIndexEntry', async () => {
    const project = makeProject('a');
    const client = createAnalysisWorkerClient();
    const entry = await client.indexEntry(project);
    expect(entry.id).toBe('a');
    expect(entry.totalKebutuhan).toBe(3);
    expect(entry.totalEksisting).toBe(2);
  });

  it('globalBreakdown() folds totals across projects, same as calling the selector directly', async () => {
    const bodies = new Map<string, Project>([
      ['a', makeProject('a')],
      ['b', makeProject('b')],
    ]);
    vi.spyOn(storage, 'getProject').mockImplementation(async id => bodies.get(id) ?? null);

    const client = createAnalysisWorkerClient();
    const buckets = await client.globalBreakdown([indexEntry('a'), indexEntry('b')]);
    const pelaksana = buckets.find(b => b.key === 'pelaksana')!;
    expect(pelaksana.kebutuhan).toBe(6);
    expect(pelaksana.eksisting).toBe(4);

    vi.restoreAllMocks();
  });

  it('globalBreakdown() honours an already-aborted AbortSignal (0 projects processed)', async () => {
    const bodies = new Map<string, Project>([['a', makeProject('a')]]);
    const readProject = vi.spyOn(storage, 'getProject').mockImplementation(async id => bodies.get(id) ?? null);

    const controller = new AbortController();
    controller.abort();
    const client = createAnalysisWorkerClient();
    const buckets = await client.globalBreakdown([indexEntry('a')], { signal: controller.signal });

    expect(readProject).not.toHaveBeenCalled();
    expect(buckets.every(b => b.kebutuhan === 0)).toBe(true);

    vi.restoreAllMocks();
  });
});

describe('workers/protocol.ts + client.ts layering (Fase 2.2)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('does not import from @/store or @/components (enforced by scripts/check-layering.mjs too)', async () => {
    // Regression guard duplicating the intent of check:layering for this
    // specific pair of new files, so a violation here fails `npm test`
    // even if `check:layering` isn't run as part of CI yet.
    const fs = await import('node:fs');
    const clientSrc = fs.readFileSync(new URL('../src/workers/client.ts', import.meta.url), 'utf-8');
    const workerSrc = fs.readFileSync(new URL('../src/workers/analysis.worker.ts', import.meta.url), 'utf-8');
    for (const src of [clientSrc, workerSrc]) {
      expect(src).not.toMatch(/from ['"]@\/store\//);
      expect(src).not.toMatch(/from ['"]@\/components\//);
    }
  });
});
