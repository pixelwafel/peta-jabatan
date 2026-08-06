import { describe, it, expect } from 'vitest';
import { computeDeleteImpact } from '../src/selectors/deleteImpact';
import { OrgNode } from '../src/models/node';
import { OrgEdge } from '../src/models/edge';

function unit(id: string, nama: string): OrgNode {
  return {
    id,
    type: 'unit',
    nama,
    nomor: '',
    rumpun: [],
    rincian: [],
    custom: {},
    position: { x: 0, y: 0 },
    collapsed: false,
    order: 0,
  };
}

function edge(source: string, target: string): OrgEdge {
  return { id: `${source}-${target}`, source, target, kind: 'hirarki' };
}

describe('computeDeleteImpact (fixing "node terisolasi" bug — hapus root OPD)', () => {
  // root -> a -> a1
  //      -> b
  const nodes = [unit('root', 'Dinas'), unit('a', 'Bidang A'), unit('a1', 'Seksi A1'), unit('b', 'Bidang B')];
  const edges = [edge('root', 'a'), edge('a', 'a1'), edge('root', 'b')];

  it('reports 0 children and no parent for a leaf node', () => {
    const impact = computeDeleteImpact(nodes, edges, 'a1');
    expect(impact.directChildCount).toBe(0);
    expect(impact.subtreeCount).toBe(0);
    expect(impact.hasParent).toBe(true);
  });

  it('reports direct + subtree counts for a mid-level unit with descendants', () => {
    const impact = computeDeleteImpact(nodes, edges, 'a');
    expect(impact.directChildCount).toBe(1); // a1
    expect(impact.subtreeCount).toBe(1); // a1
    expect(impact.hasParent).toBe(true); // a is under root
  });

  it('flags hasParent=false for the root — this is the exact scenario that orphaned nodes: deleting the root "node-only" leaves its children with no parent at all', () => {
    const impact = computeDeleteImpact(nodes, edges, 'root');
    expect(impact.directChildCount).toBe(2); // a, b
    expect(impact.subtreeCount).toBe(3); // a, a1, b
    expect(impact.hasParent).toBe(false);
  });
});
