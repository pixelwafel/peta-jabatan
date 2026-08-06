import { describe, it, expect, beforeEach } from 'vitest';
import { Project } from '../src/models/project';
import { ProjectIndexEntry } from '../src/persistence/types';
import { shouldRemindExport } from '../src/persistence/reminder';
import { migrateProject } from '../src/schema/migration';
import { buildIndexEntry } from '../src/persistence/storage';

describe('Persistence & Projects (Doc 10 Exit Criteria)', () => {
  const testProject: Project = {
    id: 'proj-persistence',
    schemaVersion: '1.0.0',
    configVersion: '2026.1',
    meta: { namaOPD: 'Dinas Perhubungan', kodeOPD: 'DISHUB', penyusun: 'Operator' },
    attributeSchema: [],
    nodes: [
      {
        id: 'node-root',
        type: 'unit',
        nama: 'Dinas Perhubungan',
        nomor: '1',
        rumpun: [],
        rincian: [],
        custom: {},
        position: { x: 0, y: 0 },
        collapsed: false,
      },
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it('migrateProject preserves valid 1.0.0 schema version', () => {
    const migrated = migrateProject(testProject);
    expect(migrated.schemaVersion).toBe('1.0.0');
    expect(migrated.id).toBe('proj-persistence');
  });

  it('shouldRemindExport respects 10-node threshold for never-exported projects', () => {
    const smallEntry: ProjectIndexEntry = {
      id: 'p1',
      namaOPD: 'Small OPD',
      kodeOPD: 'S1',
      nodeCount: 5,
      totalKebutuhan: 10,
      totalEksisting: 10,
      updatedAt: new Date().toISOString(),
      lastExportedAt: null,
    };

    const largeEntry: ProjectIndexEntry = {
      id: 'p2',
      namaOPD: 'Large OPD',
      kodeOPD: 'L1',
      nodeCount: 15,
      totalKebutuhan: 30,
      totalEksisting: 30,
      updatedAt: new Date().toISOString(),
      lastExportedAt: null,
    };

    expect(shouldRemindExport(smallEntry)).toBe(false); // < 10 nodes -> no nagging!
    expect(shouldRemindExport(largeEntry)).toBe(true);  // >= 10 nodes -> remind!
  });

  it('shouldRemindExport respects per-session snooze set', () => {
    const largeEntry: ProjectIndexEntry = {
      id: 'p2',
      namaOPD: 'Large OPD',
      kodeOPD: 'L1',
      nodeCount: 15,
      totalKebutuhan: 30,
      totalEksisting: 30,
      updatedAt: new Date().toISOString(),
      lastExportedAt: null,
    };

    const snoozed = new Set(['p2']);
    expect(shouldRemindExport(largeEntry, snoozed)).toBe(false); // Snoozed!
  });

  it('shouldRemindExport triggers when project is updated > 4 hours after last export', () => {
    const fourHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
    const recentUpdate = new Date().toISOString();

    const staleExportEntry: ProjectIndexEntry = {
      id: 'p3',
      namaOPD: 'Stale OPD',
      kodeOPD: 'ST1',
      nodeCount: 12,
      totalKebutuhan: 20,
      totalEksisting: 20,
      updatedAt: recentUpdate,
      lastExportedAt: fourHoursAgo,
    };

    expect(shouldRemindExport(staleExportEntry)).toBe(true);
  });
});

describe('buildIndexEntry — linkedCodes population (M10.4, docs/13 §2 cycle guard)', () => {
  const baseProject: Project = {
    id: 'proj-with-links',
    schemaVersion: '1.0.0',
    configVersion: '2026.1',
    meta: { namaOPD: 'Dinas Kesehatan', kodeOPD: 'DINKES', penyusun: 'Operator' },
    attributeSchema: [],
    nodes: [
      {
        id: 'node-root',
        type: 'unit',
        nama: 'Dinas Kesehatan',
        nomor: '1',
        rumpun: [],
        rincian: [],
        custom: {},
        position: { x: 0, y: 0 },
        collapsed: false,
        order: 0,
      },
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  function projectWithLinks(kodeOPDs: string[]): Project {
    return {
      ...baseProject,
      nodes: [
        ...baseProject.nodes,
        ...kodeOPDs.map((kodeOPD, i) => ({
          id: `node-link-${i}`,
          type: 'unit' as const,
          nama: `Tautan ${i}`,
          nomor: `1.${i + 1}`,
          rumpun: [],
          rincian: [],
          custom: {},
          position: { x: 0, y: 0 },
          collapsed: false,
          order: i,
          link: {
            kodeOPD,
            namaProject: `Project ${kodeOPD}`,
            cached: { kebutuhan: 0, eksisting: 0, nodeCount: 0, updatedAt: '' },
          },
        })),
      ],
    };
  }

  it('populates linkedCodes with the kodeOPD of every link node in the project', () => {
    const entry = buildIndexEntry(projectWithLinks(['PKM1', 'PKM2']));
    expect(entry.linkedCodes).toEqual(['PKM1', 'PKM2']);
  });

  it('produces an empty linkedCodes array for a project with no link nodes', () => {
    const entry = buildIndexEntry(baseProject);
    expect(entry.linkedCodes).toEqual([]);
  });

  it('preserves lastExportedAt/origin passed in as the "carry" (existing entry) values', () => {
    const entry = buildIndexEntry(baseProject, { lastExportedAt: '2026-01-01T00:00:00.000Z', origin: 'imported' });
    expect(entry.lastExportedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(entry.origin).toBe('imported');
  });
});
