import { describe, it, expect, beforeEach } from 'vitest';
import { OrgNode } from '../src/models/node';
import { OrgEdge } from '../src/models/edge';
import {
  getStructureIndex,
  getRebuildCount,
  resetRebuildCount,
  childrenOf,
  parentOf,
  ancestorsOf,
  descendantsOf,
  subtreeOf,
  designatedRoot,
  canSetParent,
  nodeTotals,
  subtreeTotals,
  projectTotals,
} from '../src/selectors';

describe('Selectors & StructureIndex (Doc 01 Exit Criteria & Performance)', () => {
  beforeEach(() => {
    resetRebuildCount();
  });

  function createTestFixture() {
    const nodes: OrgNode[] = [
      {
        id: 'root',
        type: 'unit',
        nama: 'Kepala Dinas',
        nomor: '1',
        rumpun: [],
        rincian: [],
        custom: {},
        position: { x: 100, y: 100 },
        collapsed: false,
      },
      {
        id: 'sec-1',
        type: 'unit',
        nama: 'Sekretariat',
        nomor: '1.1',
        rumpun: [],
        rincian: [],
        custom: {},
        position: { x: 50, y: 200 },
        collapsed: false,
      },
      {
        id: 'jab-1',
        type: 'jabatan',
        nama: 'Analis Kebijakan',
        nomor: '1.1.1',
        rumpun: [],
        rincian: [
          { id: 'r1', jenjangId: 'ahli_muda', kebutuhan: 3, eksisting: 2 },
          { id: 'r2', jenjangId: 'ahli_pertama', kebutuhan: 2, eksisting: 2 },
        ],
        custom: {},
        position: { x: 50, y: 300 },
        collapsed: false,
      },
    ];

    const edges: OrgEdge[] = [
      { id: 'e1', source: 'root', target: 'sec-1', kind: 'hirarki' },
      { id: 'e2', source: 'sec-1', target: 'jab-1', kind: 'hirarki' },
    ];

    return { nodes, edges };
  }

  it('StructureIndex build count remains 0 during position-only node drag updates', () => {
    let { nodes, edges } = createTestFixture();

    // Initial build
    getStructureIndex(nodes, edges);
    expect(getRebuildCount()).toBe(1);

    // Simulate 10 position drag updates (moveNodes)
    for (let i = 0; i < 10; i++) {
      nodes = nodes.map(n =>
        n.id === 'jab-1' ? { ...n, position: { x: n.position.x + i, y: n.position.y + i } } : n
      );
      getStructureIndex(nodes, edges);
    }

    // Rebuild count MUST remain 1 (0 additional rebuilds during drag!)
    expect(getRebuildCount()).toBe(1);
  });

  it('StructureIndex rebuilds when edge topology changes', () => {
    let { nodes, edges } = createTestFixture();
    getStructureIndex(nodes, edges);
    expect(getRebuildCount()).toBe(1);

    // Add a new edge
    edges = [...edges, { id: 'e3', source: 'root', target: 'jab-1', kind: 'hirarki' }];
    getStructureIndex(nodes, edges);
    expect(getRebuildCount()).toBe(2);
  });

  it('Navigation selectors work correctly', () => {
    const { nodes, edges } = createTestFixture();

    expect(childrenOf(nodes, edges, 'root').map(n => n.id)).toEqual(['sec-1']);
    expect(parentOf(nodes, edges, 'sec-1')?.id).toBe('root');
    expect(parentOf(nodes, edges, 'root')).toBeNull();

    expect(ancestorsOf(nodes, edges, 'jab-1').map(n => n.id)).toEqual(['root', 'sec-1']);
    expect(descendantsOf(nodes, edges, 'root').map(n => n.id)).toEqual(['sec-1', 'jab-1']);
    expect(subtreeOf(nodes, edges, 'sec-1').map(n => n.id)).toEqual(['sec-1', 'jab-1']);

    expect(designatedRoot(nodes, edges)?.id).toBe('root');
  });

  it('canSetParent prevents cycles at interaction layer (Invariant 4 / Constraint 6)', () => {
    const { nodes, edges } = createTestFixture();

    // Cannot set self as parent
    expect(canSetParent(nodes, edges, 'root', 'root')).toBe(false);

    // Cannot set descendant as parent (sec-1 is descendant of root)
    expect(canSetParent(nodes, edges, 'root', 'sec-1')).toBe(false);
    expect(canSetParent(nodes, edges, 'root', 'jab-1')).toBe(false);

    // Can set non-descendant parent
    expect(canSetParent(nodes, edges, 'jab-1', 'root')).toBe(true);
    expect(canSetParent(nodes, edges, 'jab-1', null)).toBe(true);
  });

  it('Totals calculation computes kebutuhan, eksisting, and selisih correctly', () => {
    const { nodes, edges } = createTestFixture();

    const rootTot = nodeTotals(nodes[0]);
    expect(rootTot).toEqual({ kebutuhan: 0, eksisting: 0, selisih: 0 });

    const jabTot = nodeTotals(nodes[2]);
    expect(jabTot).toEqual({ kebutuhan: 5, eksisting: 4, selisih: -1 });

    const subTot = subtreeTotals(nodes, edges, 'root');
    expect(subTot).toEqual({ kebutuhan: 5, eksisting: 4, selisih: -1 });

    const projTot = projectTotals(nodes);
    expect(projTot).toEqual({ kebutuhan: 5, eksisting: 4, selisih: -1 });
  });
});
