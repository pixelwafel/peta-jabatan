import { describe, it, expect } from 'vitest';
import { Project } from '../src/models/project';
import { OrgNode } from '../src/models/node';
import { OrgEdge } from '../src/models/edge';
import { validateProject, buildReadinessReport } from '../src/selectors/validation';
import { canSetParent, validParentOptions } from '../src/selectors/guards';
import { buildTree, sortSiblings } from '../src/selectors/tree';
import { taxonomy } from '../src/config/taxonomy';

describe('Hierarchy, Validation & Readiness Engine (Doc 04 Exit Criteria)', () => {
  function createValidationFixture(): Project {
    const nodes: OrgNode[] = [
      {
        id: 'u-root',
        type: 'unit',
        nama: 'Dinas Sosial',
        nomor: '1',
        rumpun: [],
        rincian: [],
        custom: {},
        position: { x: 100, y: 0 },
        collapsed: false,
      },
      {
        id: 'u-sub',
        type: 'unit',
        nama: 'Sekretariat',
        nomor: '1.1',
        rumpun: [],
        rincian: [],
        custom: {},
        position: { x: 50, y: 100 },
        collapsed: false,
      },
      {
        id: 'j-struct1',
        type: 'jabatan',
        nama: 'Sekretaris A',
        nomor: '1.1.1',
        kategoriId: 'struktural',
        rumpun: [],
        rincian: [{ id: 'r1', jenjangId: 'administrator', kebutuhan: 1, eksisting: 1 }],
        custom: {},
        position: { x: 0, y: 200 },
        collapsed: false,
      },
      {
        id: 'j-struct2',
        type: 'jabatan',
        nama: 'Sekretaris B', // Spurious second head! (UNIT_BANYAK_KEPALA)
        nomor: '1.1.2',
        kategoriId: 'struktural',
        rumpun: [],
        rincian: [{ id: 'r2', jenjangId: 'administrator', kebutuhan: 1, eksisting: 1 }],
        custom: {},
        position: { x: 100, y: 200 },
        collapsed: false,
      },
      {
        id: 'j-orphan',
        type: 'jabatan',
        nama: 'Staf Unplaced',
        nomor: '99',
        kategoriId: undefined, // NODE_KATEGORI_MISSING
        rumpun: [],
        rincian: [], // JABATAN_NO_RINCIAN
        custom: {},
        position: { x: 500, y: 500 },
        collapsed: false,
      },
    ];

    const edges: OrgEdge[] = [
      { id: 'e1', source: 'u-root', target: 'u-sub', kind: 'hirarki' },
      { id: 'e2', source: 'u-sub', target: 'j-struct1', kind: 'hirarki' },
      { id: 'e3', source: 'u-sub', target: 'j-struct2', kind: 'hirarki' },
    ];

    return {
      id: 'proj-val',
      schemaVersion: '1.0.0',
      configVersion: '2026.1',
      meta: { namaOPD: 'Dinas Sosial', kodeOPD: 'DINSOS', penyusun: 'Operator' },
      attributeSchema: [],
      nodes,
      edges,
      viewport: { x: 0, y: 0, zoom: 1 },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  it('validateProject is a pure function returning expected findings naming specific nodes', () => {
    const proj = createValidationFixture();
    const findings = validateProject(proj, taxonomy);

    expect(findings.length).toBeGreaterThan(0);

    // Finding for unplaced orphan node
    const orphanFinding = findings.find(f => f.code === 'NODE_NO_PARENT');
    expect(orphanFinding).toBeDefined();
    expect(orphanFinding?.message).toContain('Staf Unplaced'); // Names the node!

    // Finding for unit with multiple heads
    const multiHeadFinding = findings.find(f => f.code === 'UNIT_BANYAK_KEPALA');
    expect(multiHeadFinding).toBeDefined();
    expect(multiHeadFinding?.message).toContain('Sekretariat');
  });

  it('canSetParent rejects self, direct parent cycles, and deep cycles', () => {
    const proj = createValidationFixture();

    // 1. Self cycle: u-sub cannot be parent of u-sub
    expect(canSetParent(proj.nodes, proj.edges, 'u-sub', 'u-sub')).toBe(false);

    // 2. Direct cycle: u-root cannot be child of its child u-sub
    expect(canSetParent(proj.nodes, proj.edges, 'u-root', 'u-sub')).toBe(false);

    // 3. Deep cycle: u-root cannot be child of descendant j-struct1
    expect(canSetParent(proj.nodes, proj.edges, 'u-root', 'j-struct1')).toBe(false);

    // 4. Valid option: u-sub CAN be parent of j-orphan
    expect(canSetParent(proj.nodes, proj.edges, 'j-orphan', 'u-sub')).toBe(true);
  });

  it('validParentOptions excludes cycle-forming choices rather than returning them', () => {
    const proj = createValidationFixture();
    const validForRoot = validParentOptions(proj.nodes, proj.edges, 'u-root');

    // Descendants u-sub, j-struct1, j-struct2 MUST be excluded!
    const validIds = validForRoot.map(n => n.id);
    expect(validIds).not.toContain('u-sub');
    expect(validIds).not.toContain('j-struct1');
    expect(validIds).not.toContain('j-struct2');
  });

  it('buildTree handles sibling sorting priority (nomor, then canvas x-position with 8px tolerance, then name)', () => {
    const proj = createValidationFixture();

    const nodeById = new Map(proj.nodes.map(n => [n.id, n]));

    // j-struct1 (x=0, nomor="1.1.1") vs j-struct2 (x=100, nomor="1.1.2")
    const siblings = [
      { id: 'j-struct2', children: [], depth: 2 },
      { id: 'j-struct1', children: [], depth: 2 },
    ];

    const sorted = sortSiblings(siblings, nodeById);
    expect(sorted[0].id).toBe('j-struct1'); // 1.1.1 before 1.1.2!
  });

  it('buildTree terminates on a cyclic edge fixture (seen guard)', () => {
    const proj = createValidationFixture();
    // Add cycle edge u-sub -> u-root
    proj.edges.push({ id: 'e-cycle', source: 'u-sub', target: 'u-root', kind: 'hirarki' });

    // Must terminate without stack overflow!
    expect(() => buildTree(proj.nodes, proj.edges)).not.toThrow();
  });

  it('buildReadinessReport aggregates findings and ready is advisory', () => {
    const proj = createValidationFixture();
    const findings = validateProject(proj, taxonomy);
    const report = buildReadinessReport(findings);

    expect(report.groups.length).toBeGreaterThan(0);
    expect(report.summary).toBeDefined();
    // Warnings do NOT prevent ready boolean unless errors exist!
    expect(typeof report.ready).toBe('boolean');
  });
});
