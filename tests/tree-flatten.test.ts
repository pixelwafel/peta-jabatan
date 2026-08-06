import { describe, it, expect } from 'vitest';
import { buildTree, flattenVisibleTree } from '../src/selectors/tree';
import { OrgNode } from '../src/models/node';
import { OrgEdge } from '../src/models/edge';

// Fase 2.5 — flattenVisibleTree adalah dasar virtualisasi TreeView.tsx
// (components/tree/TreeView.tsx): daripada merender seluruh pohon rekursif
// ke DOM, TreeView cuma me-render window dari array datar ini.

function makeNode(id: string, extra: Partial<OrgNode> = {}): OrgNode {
  return {
    id,
    type: 'unit',
    nama: id,
    nomor: '',
    rumpun: [],
    rincian: [],
    custom: {},
    position: { x: 0, y: 0 },
    collapsed: false,
    order: 0,
    ...extra,
  };
}

describe('flattenVisibleTree (Fase 2.5)', () => {
  it('flattens a simple 3-level tree top-down, preserving order', () => {
    const nodes: OrgNode[] = [
      makeNode('root'),
      makeNode('a'),
      makeNode('b'),
      makeNode('a1'),
    ];
    const edges: OrgEdge[] = [
      { id: 'e1', source: 'root', target: 'a', kind: 'hirarki' },
      { id: 'e2', source: 'root', target: 'b', kind: 'hirarki' },
      { id: 'e3', source: 'a', target: 'a1', kind: 'hirarki' },
    ];
    const nodeById = new Map(nodes.map(n => [n.id, n]));
    const tree = buildTree(nodes, edges);
    const rows = flattenVisibleTree(tree, nodeById);

    expect(rows.map(r => r.id)).toEqual(['root', 'a', 'a1', 'b']);
    expect(rows.map(r => r.depth)).toEqual([0, 1, 2, 1]);
    expect(rows.find(r => r.id === 'root')?.hasChildren).toBe(true);
    expect(rows.find(r => r.id === 'a1')?.hasChildren).toBe(false);
  });

  it('skips descendants of a collapsed node but still reports hasChildren for it', () => {
    const nodes: OrgNode[] = [
      makeNode('root'),
      makeNode('a', { collapsed: true }),
      makeNode('a1'),
      makeNode('a2'),
      makeNode('b'),
    ];
    const edges: OrgEdge[] = [
      { id: 'e1', source: 'root', target: 'a', kind: 'hirarki' },
      { id: 'e2', source: 'root', target: 'b', kind: 'hirarki' },
      { id: 'e3', source: 'a', target: 'a1', kind: 'hirarki' },
      { id: 'e4', source: 'a', target: 'a2', kind: 'hirarki' },
    ];
    const nodeById = new Map(nodes.map(n => [n.id, n]));
    const tree = buildTree(nodes, edges);
    const rows = flattenVisibleTree(tree, nodeById);

    // a1/a2 tidak muncul (subtree 'a' collapsed), tapi 'a' sendiri tetap
    // muncul dan hasChildren-nya tetap true (chevron masih bisa dibuka lagi).
    expect(rows.map(r => r.id)).toEqual(['root', 'a', 'b']);
    expect(rows.find(r => r.id === 'a')?.hasChildren).toBe(true);
  });

  it('a collapsed leaf (no children) behaves like a normal leaf', () => {
    const nodes: OrgNode[] = [makeNode('root', { collapsed: true })];
    const nodeById = new Map(nodes.map(n => [n.id, n]));
    const tree = buildTree(nodes, []);
    const rows = flattenVisibleTree(tree, nodeById);

    expect(rows).toEqual([{ id: 'root', depth: 0, hasChildren: false }]);
  });

  it('empty tree flattens to an empty array', () => {
    expect(flattenVisibleTree([], new Map())).toEqual([]);
  });
});
