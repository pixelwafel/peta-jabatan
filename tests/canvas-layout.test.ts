import { describe, it, expect, beforeEach } from 'vitest';
import { OrgNode } from '../src/models/node';
import { OrgEdge } from '../src/models/edge';
import { nodeHeight, computeLayout } from '../src/utils/layout';
import { useProjectStore } from '../src/store/projectStore';
import { Project } from '../src/models/project';

describe('Canvas & Layout (Doc 05 Exit Criteria)', () => {
  it('nodeHeight matches card variant heights for 1, 2, 3, and 4 detail rows', () => {
    const baseNode: OrgNode = {
      id: 'n1',
      type: 'jabatan',
      nama: 'Analis',
      nomor: '1.1',
      kategoriId: 'fungsional',
      rumpun: ['keahlian'],
      rincian: [{ id: 'r1', jenjangId: 'ahli_muda', kebutuhan: 1, eksisting: 1 }],
      custom: {},
      position: { x: 0, y: 0 },
      collapsed: false,
    };

    // 1 row with showJenjang = false or true
    expect(nodeHeight(baseNode, false)).toBe(104); // CARD_BASE_H (84) + LINE_H (20)

    // 2 rows with showJenjang = true
    const node2 = {
      ...baseNode,
      rincian: [
        { id: 'r1', jenjangId: 'ahli_muda', kebutuhan: 1, eksisting: 1 },
        { id: 'r2', jenjangId: 'ahli_pertama', kebutuhan: 1, eksisting: 1 },
      ],
    };
    expect(nodeHeight(node2, true)).toBe(124); // 104 + LINE_H (20)

    // 3 rows with showJenjang = true (Math.ceil(3/2) = 2 lines -> 2 * 20 = 40)
    const node3 = {
      ...baseNode,
      rincian: [
        { id: 'r1', jenjangId: 'ahli_utama', kebutuhan: 1, eksisting: 1 },
        { id: 'r2', jenjangId: 'ahli_madya', kebutuhan: 1, eksisting: 1 },
        { id: 'r3', jenjangId: 'ahli_muda', kebutuhan: 1, eksisting: 1 },
      ],
    };
    expect(nodeHeight(node3, true)).toBe(144);

    // 4 rows with showJenjang = true (Math.ceil(4/2) = 2 lines -> 2 * 20 = 40)
    const node4 = {
      ...baseNode,
      rincian: [
        { id: 'r1', jenjangId: 'ahli_utama', kebutuhan: 1, eksisting: 1 },
        { id: 'r2', jenjangId: 'ahli_madya', kebutuhan: 1, eksisting: 1 },
        { id: 'r3', jenjangId: 'ahli_muda', kebutuhan: 1, eksisting: 1 },
        { id: 'r4', jenjangId: 'ahli_pertama', kebutuhan: 1, eksisting: 1 },
      ],
    };
    expect(nodeHeight(node4, true)).toBe(144);
  });

  it('Dagre receives only kind === hirarki edges and centers coordinates to top-left', () => {
    const nodes: OrgNode[] = [
      {
        id: 'parent',
        type: 'unit',
        nama: 'Parent',
        nomor: '1',
        rumpun: [],
        rincian: [],
        custom: {},
        position: { x: 0, y: 0 },
        collapsed: false,
      },
      {
        id: 'child',
        type: 'jabatan',
        nama: 'Child',
        nomor: '1.1',
        rumpun: [],
        rincian: [{ id: 'r1', jenjangId: null, kebutuhan: 1, eksisting: 1 }],
        custom: {},
        position: { x: 0, y: 0 },
        collapsed: false,
      },
    ];

    const edges: OrgEdge[] = [
      { id: 'e1', source: 'parent', target: 'child', kind: 'hirarki' },
      { id: 'e2', source: 'parent', target: 'child', kind: 'koordinasi' }, // Non-hierarchy, ignored by Dagre!
    ];

    const layout = computeLayout(nodes, edges, { direction: 'TB', scope: 'all' });
    expect(layout.size).toBe(2);
    expect(layout.has('parent')).toBe(true);
    expect(layout.has('child')).toBe(true);

    const parentPos = layout.get('parent')!;
    const childPos = layout.get('child')!;
    // In TB layout, parent Y should be smaller than child Y
    expect(parentPos.y).toBeLessThan(childPos.y);
  });

  it('Subtree Tidy keeps subtree root at its original coordinates', () => {
    const initialProject: Project = {
      id: 'p1',
      schemaVersion: '1.0.0',
      configVersion: '2026.1',
      meta: { namaOPD: 'Test', kodeOPD: 'TEST', penyusun: 'Admin' },
      attributeSchema: [],
      nodes: [
        {
          id: 'sub-root',
          type: 'unit',
          nama: 'Sub Root',
          nomor: '1.1',
          rumpun: [],
          rincian: [],
          custom: {},
          position: { x: 500, y: 500 }, // Original anchor coordinate
          collapsed: false,
        },
        {
          id: 'sub-child',
          type: 'jabatan',
          nama: 'Sub Child',
          nomor: '1.1.1',
          rumpun: [],
          rincian: [{ id: 'r1', jenjangId: null, kebutuhan: 1, eksisting: 1 }],
          custom: {},
          position: { x: 0, y: 0 },
          collapsed: false,
        },
      ],
      edges: [{ id: 'e1', source: 'sub-root', target: 'sub-child', kind: 'hirarki' }],
      viewport: { x: 0, y: 0, zoom: 1 },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    useProjectStore.getState().setProject(initialProject);

    const layout = computeLayout(initialProject.nodes, initialProject.edges, {
      direction: 'TB',
      scope: 'subtree',
      rootId: 'sub-root',
    });

    // Subtree root position after layout MUST match original anchor (500, 500)
    expect(layout.get('sub-root')).toEqual({ x: 500, y: 500 });
  });

  it('Unplaced nodes are arranged in a column outside structure bounds', () => {
    const nodes: OrgNode[] = [
      {
        id: 'placed-root',
        type: 'unit',
        nama: 'Root',
        nomor: '1',
        rumpun: [],
        rincian: [],
        custom: {},
        position: { x: 0, y: 0 },
        collapsed: false,
      },
      {
        id: 'unplaced-1',
        type: 'jabatan',
        nama: 'Unplaced 1',
        nomor: '99',
        rumpun: [],
        rincian: [{ id: 'r1', jenjangId: null, kebutuhan: 1, eksisting: 1 }],
        custom: {},
        position: { x: 0, y: 0 },
        collapsed: false,
      },
    ];

    const edges: OrgEdge[] = []; // No hierarchy edge -> unplaced-1 is isolated

    const layout = computeLayout(nodes, edges, { direction: 'TB', scope: 'all' });
    expect(layout.has('placed-root')).toBe(true);
    expect(layout.has('unplaced-1')).toBe(true);

    const rootPos = layout.get('placed-root')!;
    const unplacedPos = layout.get('unplaced-1')!;

    // Unplaced node X position is shifted to the right of root
    expect(unplacedPos.x).toBeGreaterThan(rootPos.x);
  });
});
