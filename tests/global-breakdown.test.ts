import { describe, it, expect, vi } from 'vitest';
import { computeGlobalBreakdown } from '../src/selectors/globalBreakdown';
import { Project } from '../src/models/project';
import { OrgNode } from '../src/models/node';
import { ProjectIndexEntry } from '../src/persistence/types';

function makeProject(id: string, kategoriId: string, kebutuhan: number, eksisting: number): Project {
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
      kategoriId,
      rumpun: [],
      rincian: [{ id: 'r1', jenjangId: null, kebutuhan, eksisting }],
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

describe('computeGlobalBreakdown (M11.5, docs/14-recap-dashboard.md §5)', () => {
  it('folds perKategori totals across multiple top-level projects', async () => {
    const bodies = new Map<string, Project>([
      ['a', makeProject('a', 'pelaksana', 10, 8)],
      ['b', makeProject('b', 'pelaksana', 5, 5)],
    ]);
    const readProject = async (id: string) => bodies.get(id) ?? null;

    const buckets = await computeGlobalBreakdown([indexEntry('a'), indexEntry('b')], readProject);
    const pelaksana = buckets.find(b => b.key === 'pelaksana')!;

    expect(pelaksana.kebutuhan).toBe(15);
    expect(pelaksana.eksisting).toBe(13);
    expect(pelaksana.nodeCount).toBe(2);
  });

  it('reads projects sequentially with a yield between each (onProgress fires once per project, in order)', async () => {
    const bodies = new Map<string, Project>([
      ['a', makeProject('a', 'pelaksana', 1, 1)],
      ['b', makeProject('b', 'fungsional', 2, 2)],
    ]);
    const readProject = vi.fn(async (id: string) => bodies.get(id) ?? null);
    const progressCalls: Array<[number, number]> = [];

    await computeGlobalBreakdown([indexEntry('a'), indexEntry('b')], readProject, {
      onProgress: (done, total) => progressCalls.push([done, total]),
    });

    expect(readProject).toHaveBeenNthCalledWith(1, 'a');
    expect(readProject).toHaveBeenNthCalledWith(2, 'b');
    expect(progressCalls).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });

  it('aborts cleanly via AbortSignal without processing remaining entries', async () => {
    const bodies = new Map<string, Project>([
      ['a', makeProject('a', 'pelaksana', 100, 100)],
      ['b', makeProject('b', 'pelaksana', 200, 200)],
    ]);
    const controller = new AbortController();
    const readProject = vi.fn(async (id: string) => {
      if (id === 'a') controller.abort(); // simulasikan navigasi/batal setelah project pertama
      return bodies.get(id) ?? null;
    });

    const buckets = await computeGlobalBreakdown([indexEntry('a'), indexEntry('b')], readProject, {
      signal: controller.signal,
    });

    // 'b' tidak pernah dibaca karena signal sudah aborted sebelum iterasi ke-2
    expect(readProject).toHaveBeenCalledTimes(1);
    const pelaksana = buckets.find(b => b.key === 'pelaksana')!;
    expect(pelaksana.kebutuhan).toBe(100); // hanya 'a' yang terhitung
  });

  it('a missing/unreadable project body is skipped without throwing', async () => {
    const readProject = async () => null;
    const buckets = await computeGlobalBreakdown([indexEntry('missing')], readProject);
    expect(buckets.every(b => b.kebutuhan === 0)).toBe(true);
  });

  it('reconciles with the headline total on the linked fixture: sum of top-level projects own breakdown matches their own totals', async () => {
    // Catatan: figur link-node TIDAK dipecah ke kategori (lihat komentar
    // di globalBreakdown.ts) — breakdown project bertaut hanya mencerminkan
    // isi jabatan project itu sendiri, konsisten dengan cara kartu dashboard
    // menampilkan total (M11.2) yang datang dari resolusi link, bukan dari
    // breakdown per-kategori.
    const dinkes = makeProject('dinkes', 'struktural', 3, 2);
    const readProject = async (id: string) => (id === 'dinkes' ? dinkes : null);
    const buckets = await computeGlobalBreakdown([indexEntry('dinkes')], readProject);
    const struktural = buckets.find(b => b.key === 'struktural')!;
    expect(struktural.kebutuhan).toBe(3);
    expect(struktural.eksisting).toBe(2);
  });
});
