import { describe, it, expect, beforeEach } from 'vitest';
import { resolveLink, canCreateLink, cachedTotals } from '../src/selectors/linkResolver';
import { useProjectStore } from '../src/store/projectStore';
import { ProjectIndex } from '../src/persistence/types';
import { Project } from '../src/models/project';
import { LinkRef } from '../src/models/node';

function makeIndex(entries: ProjectIndex['entries']): ProjectIndex {
  return { version: 1, activeId: entries[0]?.id ?? null, entries };
}

function makeProjectWithLink(link: LinkRef): Project {
  return {
    id: 'p-source',
    schemaVersion: '1.0.0',
    configVersion: '2026.1',
    meta: { namaOPD: 'Dinas Kesehatan', kodeOPD: 'DINKES', penyusun: 'Op' },
    attributeSchema: [],
    nodes: [
      {
        id: 'n-link',
        type: 'unit',
        nama: 'Puskesmas Kota Timur',
        nomor: '1.4',
        rumpun: [],
        rincian: [],
        custom: {},
        position: { x: 0, y: 0 },
        collapsed: false,
        order: 0,
        link,
      },
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe('resolveLink (docs/13 §2)', () => {
  it('resolves live from an index entry matching kodeOPD', () => {
    const ref: LinkRef = {
      kodeOPD: 'PKM-KTIM',
      namaProject: 'Puskesmas Kota Timur',
      cached: { kebutuhan: 0, eksisting: 0, nodeCount: 0, updatedAt: '' },
    };
    const index = makeIndex([
      {
        id: 'target-1',
        namaOPD: 'Puskesmas Kota Timur',
        kodeOPD: 'PKM-KTIM',
        nodeCount: 41,
        totalKebutuhan: 52,
        totalEksisting: 47,
        updatedAt: '2026-07-14T00:00:00.000Z',
        lastExportedAt: null,
      },
    ]);

    useProjectStore.getState().setProject(makeProjectWithLink(ref));
    const resolved = resolveLink(ref, index);

    expect(resolved.status).toBe('live');
    expect(resolved.totals).toEqual({ kebutuhan: 52, eksisting: 47, selisih: -5 });
    expect(resolved.nodeCount).toBe(41);
    expect(resolved.targetProjectId).toBe('target-1');
  });

  it('falls back to cached totals when target is not in the index but a cache exists', () => {
    const ref: LinkRef = {
      kodeOPD: 'PKM-GONE',
      namaProject: 'Puskesmas Terhapus',
      cached: { kebutuhan: 20, eksisting: 18, nodeCount: 10, updatedAt: '2026-06-01T00:00:00.000Z' },
    };
    const resolved = resolveLink(ref, makeIndex([]));

    expect(resolved.status).toBe('cached');
    expect(resolved.totals).toEqual({ kebutuhan: 20, eksisting: 18, selisih: -2 });
    expect(resolved.asOf).toBe('2026-06-01T00:00:00.000Z');
  });

  it('reports unresolved when neither the index nor a cache has data', () => {
    const ref: LinkRef = {
      kodeOPD: 'PKM-BELUM-ADA',
      namaProject: 'Puskesmas Belum Diimpor',
      cached: { kebutuhan: 0, eksisting: 0, nodeCount: 0, updatedAt: '' },
    };
    const resolved = resolveLink(ref, makeIndex([]));

    expect(resolved.status).toBe('unresolved');
    expect(resolved.totals).toEqual({ kebutuhan: 0, eksisting: 0, selisih: 0 });
  });

  it('writes resolved live figures back into link.cached via a transient commit (no history entry)', () => {
    const ref: LinkRef = {
      kodeOPD: 'PKM-KTIM',
      namaProject: 'Puskesmas Kota Timur',
      cached: { kebutuhan: 0, eksisting: 0, nodeCount: 0, updatedAt: '' },
    };
    const index = makeIndex([
      {
        id: 'target-1',
        namaOPD: 'Puskesmas Kota Timur',
        kodeOPD: 'PKM-KTIM',
        nodeCount: 41,
        totalKebutuhan: 52,
        totalEksisting: 47,
        updatedAt: '2026-07-14T00:00:00.000Z',
        lastExportedAt: null,
      },
    ]);

    useProjectStore.getState().setProject(makeProjectWithLink(ref));
    resolveLink(ref, index);

    const node = useProjectStore.getState().project!.nodes.find(n => n.id === 'n-link')!;
    expect(node.link!.cached).toEqual({
      kebutuhan: 52,
      eksisting: 47,
      nodeCount: 41,
      updatedAt: '2026-07-14T00:00:00.000Z',
    });
  });
});

describe('cachedTotals', () => {
  it('derives selisih from cached kebutuhan/eksisting', () => {
    const ref: LinkRef = {
      kodeOPD: 'X',
      namaProject: 'X',
      cached: { kebutuhan: 10, eksisting: 4, nodeCount: 1, updatedAt: '' },
    };
    expect(cachedTotals(ref)).toEqual({ kebutuhan: 10, eksisting: 4, selisih: -6 });
  });
});

describe('canCreateLink — cycle guard (docs/13 §2)', () => {
  it('allows linking to a project with no outgoing links', () => {
    const index = makeIndex([
      { id: 'b', namaOPD: 'B', kodeOPD: 'B', nodeCount: 0, totalKebutuhan: 0, totalEksisting: 0, updatedAt: '', lastExportedAt: null },
    ]);
    expect(canCreateLink(index, 'A', 'B')).toBe(true);
  });

  it('allows linking to a project not yet present in the index (free-entry code)', () => {
    expect(canCreateLink(makeIndex([]), 'A', 'BELUM-ADA')).toBe(true);
  });

  it('refuses a direct cycle: A links B, B already links A', () => {
    const index = makeIndex([
      { id: 'a', namaOPD: 'A', kodeOPD: 'A', nodeCount: 0, totalKebutuhan: 0, totalEksisting: 0, updatedAt: '', lastExportedAt: null },
      {
        id: 'b',
        namaOPD: 'B',
        kodeOPD: 'B',
        nodeCount: 0,
        totalKebutuhan: 0,
        totalEksisting: 0,
        updatedAt: '',
        lastExportedAt: null,
        linkedCodes: ['A'],
      },
    ]);
    expect(canCreateLink(index, 'A', 'B')).toBe(false);
  });

  it('refuses a transitive cycle: A -> B -> C -> A', () => {
    const index = makeIndex([
      { id: 'b', namaOPD: 'B', kodeOPD: 'B', nodeCount: 0, totalKebutuhan: 0, totalEksisting: 0, updatedAt: '', lastExportedAt: null, linkedCodes: ['C'] },
      { id: 'c', namaOPD: 'C', kodeOPD: 'C', nodeCount: 0, totalKebutuhan: 0, totalEksisting: 0, updatedAt: '', lastExportedAt: null, linkedCodes: ['A'] },
    ]);
    expect(canCreateLink(index, 'A', 'B')).toBe(false);
  });

  it('rejects linking a project to itself', () => {
    expect(canCreateLink(makeIndex([]), 'A', 'A')).toBe(false);
  });

  it('does not stack-overflow on a long chain (depth cap 10) and treats it as safe', () => {
    const entries: ProjectIndex['entries'] = [];
    for (let i = 0; i < 15; i++) {
      entries.push({
        id: `n${i}`,
        namaOPD: `N${i}`,
        kodeOPD: `N${i}`,
        nodeCount: 0,
        totalKebutuhan: 0,
        totalEksisting: 0,
        updatedAt: '',
        lastExportedAt: null,
        linkedCodes: [`N${i + 1}`],
      });
    }
    const index = makeIndex(entries);
    // Chain N0 -> N1 -> ... -> N14 never comes back to 'A'; must terminate.
    expect(() => canCreateLink(index, 'A', 'N0')).not.toThrow();
    expect(canCreateLink(index, 'A', 'N0')).toBe(true);
  });
});
