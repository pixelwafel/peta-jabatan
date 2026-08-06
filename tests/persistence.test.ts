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

  it('populates linkedCodes with the kodeOPD of every link node in the project', async () => {
    const entry = await buildIndexEntry(projectWithLinks(['PKM1', 'PKM2']));
    expect(entry.linkedCodes).toEqual(['PKM1', 'PKM2']);
  });

  it('produces an empty linkedCodes array for a project with no link nodes', async () => {
    const entry = await buildIndexEntry(baseProject);
    expect(entry.linkedCodes).toEqual([]);
  });

  it('preserves lastExportedAt/origin passed in as the "carry" (existing entry) values', async () => {
    const entry = await buildIndexEntry(baseProject, { lastExportedAt: '2026-01-01T00:00:00.000Z', origin: 'imported' });
    expect(entry.lastExportedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(entry.origin).toBe('imported');
  });

  it('populates findingCounts from validateProject (M11.1, docs/14 §2)', async () => {
    // baseProject punya kodeOPD/namaOPD terisi -> tidak ada error META_OPD_MISSING
    const entry = await buildIndexEntry(baseProject);
    expect(entry.findingCounts).toBeDefined();
    expect(typeof entry.findingCounts!.errors).toBe('number');
    expect(typeof entry.findingCounts!.warnings).toBe('number');
    expect(entry.findingCounts!.errors).toBe(0);
  });

  it('findingCounts reflects a real error (missing kodeOPD -> META_OPD_MISSING)', async () => {
    const broken: Project = { ...baseProject, meta: { ...baseProject.meta, kodeOPD: '' } };
    const entry = await buildIndexEntry(broken);
    expect(entry.findingCounts!.errors).toBeGreaterThanOrEqual(1);
  });

  it('totalKebutuhan/totalEksisting include link node contributions when an index is passed (M11.2 double-count guard prerequisite)', async () => {
    const base = projectWithLinks(['PKM-KTIM']);
    // projectWithLinks lampirkan link node sebagai orphan (tanpa edge) — di
    // sini butuh benar-benar jadi anak root supaya masuk hitungan `total`.
    const linkedProject: Project = {
      ...base,
      edges: [{ id: 'e-link', source: 'node-root', target: 'node-link-0', kind: 'hirarki' }],
    };
    const targetIndex = {
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
          updatedAt: new Date().toISOString(),
          lastExportedAt: null,
        },
      ],
    };

    const withoutIndex = await buildIndexEntry(linkedProject);
    const withIndex = await buildIndexEntry(linkedProject, undefined, targetIndex);

    expect(withoutIndex.totalKebutuhan).toBe(0); // tautan tak resolve tanpa index -> kontribusi nol
    expect(withIndex.totalKebutuhan).toBe(52);
    expect(withIndex.totalEksisting).toBe(47);
  });

  it('totalKebutuhan/totalEksisting include template-instance contributions (M12.10 dashboard reconciliation, docs/15 §3)', async () => {
    const projectWithTemplate: Project = {
      ...baseProject,
      nodes: [
        ...baseProject.nodes,
        {
          id: 'sekolah',
          type: 'unit',
          nama: 'SD (Template)',
          nomor: '1.1',
          rumpun: [],
          rincian: [],
          custom: {},
          position: { x: 0, y: 0 },
          collapsed: false,
          order: 0,
          isTemplate: true,
        },
        {
          id: 'guru',
          type: 'jabatan',
          nama: 'Guru Kelas',
          nomor: '1.1.1',
          kategoriId: 'fungsional',
          rumpun: ['keahlian'],
          rincian: [{ id: 'r1', jenjangId: 'ahli_pertama', kebutuhan: 0, eksisting: 0 }],
          custom: {},
          position: { x: 0, y: 0 },
          collapsed: false,
          order: 0,
        },
      ],
      edges: [
        { id: 'e-sekolah', source: 'node-root', target: 'sekolah', kind: 'hirarki' },
        { id: 'e-guru', source: 'sekolah', target: 'guru', kind: 'hirarki' },
      ],
      instances: [
        { id: 'i1', templateNodeId: 'sekolah', nama: 'SDN 01', figures: { r1: { kebutuhan: 4, eksisting: 3 } } },
        { id: 'i2', templateNodeId: 'sekolah', nama: 'SDN 02', figures: { r1: { kebutuhan: 5, eksisting: 5 } } },
      ],
    };

    const entry = await buildIndexEntry(projectWithTemplate);
    // Dashboard (M11) & rekap konsolidasi harus melihat total INSTANCE
    // (4+5=9, 3+5=8), bukan angka baris mentah (yang selalu nol) — tanpa
    // dobel hitung dengan jumlah instance itu sendiri.
    expect(entry.totalKebutuhan).toBe(9);
    expect(entry.totalEksisting).toBe(8);
  });
});
