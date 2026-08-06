import { describe, it, expect } from 'vitest';
import { classifyBatch, ParsedFile } from '../src/import/bulkStaging';
import { Project } from '../src/models/project';
import { ProjectIndex } from '../src/persistence/types';

function project(kodeOPD: string, updatedAt: string): Project {
  return {
    id: `proj-${kodeOPD}-${updatedAt}`,
    schemaVersion: '1.0.0',
    configVersion: '2026.1',
    meta: { namaOPD: kodeOPD, kodeOPD, penyusun: 'Admin' },
    attributeSchema: [],
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    createdAt: updatedAt,
    updatedAt,
  };
}

function parsed(clientId: string, fileName: string, p: Project | null, parseFailed = false): ParsedFile {
  return { clientId, fileName, project: p, parseFailed };
}

const emptyIndex: ProjectIndex = { version: 1, activeId: null, entries: [] };

describe('classifyBatch (M11.7, docs/14-recap-dashboard.md §4)', () => {
  it('a kodeOPD not present in storage stages as "new"', () => {
    const results = classifyBatch([parsed('c1', 'a.json', project('DINKES', '2026-08-01'))], emptyIndex);
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('new');
    expect(results[0].kodeOPD).toBe('DINKES');
  });

  it('same kodeOPD, incoming newer than stored -> "replace"', () => {
    const index: ProjectIndex = {
      version: 1,
      activeId: null,
      entries: [
        {
          id: 'existing-id',
          namaOPD: 'DINKES',
          kodeOPD: 'DINKES',
          nodeCount: 0,
          totalKebutuhan: 0,
          totalEksisting: 0,
          updatedAt: '2026-01-01T00:00:00.000Z',
          lastExportedAt: null,
        },
      ],
    };
    const results = classifyBatch(
      [parsed('c1', 'a.json', project('DINKES', '2026-08-01T00:00:00.000Z'))],
      index
    );
    expect(results[0].status).toBe('replace');
    expect(results[0].existingId).toBe('existing-id');
  });

  it('same kodeOPD, incoming older than stored -> "older" (skip, overridable)', () => {
    const index: ProjectIndex = {
      version: 1,
      activeId: null,
      entries: [
        {
          id: 'existing-id',
          namaOPD: 'DINKES',
          kodeOPD: 'DINKES',
          nodeCount: 0,
          totalKebutuhan: 0,
          totalEksisting: 0,
          updatedAt: '2026-08-01T00:00:00.000Z',
          lastExportedAt: null,
        },
      ],
    };
    const results = classifyBatch(
      [parsed('c1', 'a.json', project('DINKES', '2026-01-01T00:00:00.000Z'))],
      index
    );
    expect(results[0].status).toBe('older');
    expect(results[0].existingId).toBe('existing-id');
  });

  it('a fatal parse/schema failure stages as "invalid" with no kodeOPD', () => {
    const results = classifyBatch([parsed('c1', 'broken.xlsx', null, true)], emptyIndex);
    expect(results[0].status).toBe('invalid');
    expect(results[0].kodeOPD).toBeNull();
  });

  it('two files in the same batch sharing a kodeOPD: newest wins, other flagged "duplicate-in-batch"', () => {
    const results = classifyBatch(
      [
        parsed('c1', 'old.json', project('DINKES', '2026-01-01T00:00:00.000Z')),
        parsed('c2', 'new.json', project('DINKES', '2026-08-01T00:00:00.000Z')),
      ],
      emptyIndex
    );

    const winner = results.find(r => r.fileName === 'new.json')!;
    const loser = results.find(r => r.fileName === 'old.json')!;

    expect(winner.status).toBe('new'); // menang di batch, DAN belum ada di storage -> new
    expect(loser.status).toBe('duplicate-in-batch');
  });

  it('across all five statuses in one batch (exit criteria: 40-fixture stress in miniature)', () => {
    const index: ProjectIndex = {
      version: 1,
      activeId: null,
      entries: [
        {
          id: 'existing-replace',
          namaOPD: 'DISHUB',
          kodeOPD: 'DISHUB',
          nodeCount: 0,
          totalKebutuhan: 0,
          totalEksisting: 0,
          updatedAt: '2026-01-01T00:00:00.000Z',
          lastExportedAt: null,
        },
        {
          id: 'existing-older',
          namaOPD: 'DISDIK',
          kodeOPD: 'DISDIK',
          nodeCount: 0,
          totalKebutuhan: 0,
          totalEksisting: 0,
          updatedAt: '2026-08-01T00:00:00.000Z',
          lastExportedAt: null,
        },
      ],
    };

    const results = classifyBatch(
      [
        parsed('c1', 'new-opd.json', project('DINKES', '2026-08-01T00:00:00.000Z')), // new
        parsed('c2', 'dishub.json', project('DISHUB', '2026-08-05T00:00:00.000Z')), // replace
        parsed('c3', 'disdik.json', project('DISDIK', '2026-01-01T00:00:00.000Z')), // older
        parsed('c4', 'broken.json', null, true), // invalid
        parsed('c5', 'dup-a.json', project('BAPPEDA', '2026-01-01T00:00:00.000Z')), // duplicate-in-batch (loses)
        parsed('c6', 'dup-b.json', project('BAPPEDA', '2026-06-01T00:00:00.000Z')), // new (wins the dup)
      ],
      index
    );

    const byFile = new Map(results.map(r => [r.fileName, r.status]));
    expect(byFile.get('new-opd.json')).toBe('new');
    expect(byFile.get('dishub.json')).toBe('replace');
    expect(byFile.get('disdik.json')).toBe('older');
    expect(byFile.get('broken.json')).toBe('invalid');
    expect(byFile.get('dup-a.json')).toBe('duplicate-in-batch');
    expect(byFile.get('dup-b.json')).toBe('new');
  });
});
