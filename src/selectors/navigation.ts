import { OrgNode } from '@/models/node';
import { OrgEdge } from '@/models/edge';
import { TreeNode } from '@/models/derived';
import { getStructureIndex } from './structureIndex';
import { segmentCount, compareNomor } from '@/utils/numbering';

export function childrenOf(nodes: OrgNode[], edges: OrgEdge[], nodeId: string): OrgNode[] {
  const index = getStructureIndex(nodes, edges);
  const kids = index.childIds.get(nodeId) ?? [];
  return kids.map(id => index.nodeById.get(id)!).filter(Boolean);
}

export function parentOf(nodes: OrgNode[], edges: OrgEdge[], nodeId: string): OrgNode | null {
  const index = getStructureIndex(nodes, edges);
  const pId = index.parentId.get(nodeId);
  if (!pId) return null;
  return index.nodeById.get(pId) ?? null;
}

export function ancestorsOf(nodes: OrgNode[], edges: OrgEdge[], nodeId: string): OrgNode[] {
  const index = getStructureIndex(nodes, edges);
  const ancestors: OrgNode[] = [];
  let curr = index.parentId.get(nodeId);

  while (curr) {
    const parentNode = index.nodeById.get(curr);
    if (parentNode) {
      ancestors.unshift(parentNode); // Root-first
    }
    curr = index.parentId.get(curr);
  }

  return ancestors;
}

export function descendantsOf(nodes: OrgNode[], edges: OrgEdge[], nodeId: string): OrgNode[] {
  const index = getStructureIndex(nodes, edges);
  const descendants: OrgNode[] = [];
  const queue = [...(index.childIds.get(nodeId) ?? [])];

  while (queue.length > 0) {
    const childId = queue.shift()!;
    const childNode = index.nodeById.get(childId);
    if (childNode) {
      descendants.push(childNode);
      queue.push(...(index.childIds.get(childId) ?? []));
    }
  }

  return descendants;
}

export function subtreeOf(nodes: OrgNode[], edges: OrgEdge[], nodeId: string): OrgNode[] {
  const index = getStructureIndex(nodes, edges);
  const self = index.nodeById.get(nodeId);
  if (!self) return [];
  return [self, ...descendantsOf(nodes, edges, nodeId)];
}

export function rootNodes(nodes: OrgNode[], edges: OrgEdge[]): OrgNode[] {
  const index = getStructureIndex(nodes, edges);
  return nodes.filter(n => !index.parentId.has(n.id));
}

export function designatedRoot(nodes: OrgNode[], edges: OrgEdge[]): OrgNode | null {
  const roots = rootNodes(nodes, edges);
  if (roots.length === 0) return null;
  if (roots.length === 1) return roots[0];

  // Multiple root candidates: choose shortest nomor, tie-broken by compareNomor
  return [...roots].sort((a, b) => {
    const segDiff = segmentCount(a.nomor) - segmentCount(b.nomor);
    if (segDiff !== 0) return segDiff;
    return compareNomor(a.nomor, b.nomor);
  })[0];
}

export function orphanNodes(nodes: OrgNode[], edges: OrgEdge[]): OrgNode[] {
  const root = designatedRoot(nodes, edges);
  const roots = rootNodes(nodes, edges);
  if (!root) return roots;
  return roots.filter(r => r.id !== root.id);
}

export function depthOf(nodes: OrgNode[], edges: OrgEdge[], nodeId: string): number {
  return ancestorsOf(nodes, edges, nodeId).length;
}

/**
 * Depth SEMUA node dalam satu BFS top-down, O(N) total. Fase 1.4: dulu
 * beberapa caller (ParentSelect, recap.ts perUnit) memanggil depthOf() satu
 * per satu di dalam loop atas banyak node — tiap panggilan sendiri O(depth)
 * lewat ancestorsOf(), tapi dijumlah atas N node jadi O(N·depth), bisa
 * mendekati O(N²) di project besar. Pakai fungsi ini SEKALI di luar loop
 * kalau depth dibutuhkan untuk banyak node sekaligus; depthOf() tetap ada
 * untuk kasus satu node saja.
 */
export function allDepths(nodes: OrgNode[], edges: OrgEdge[]): Map<string, number> {
  const idx = getStructureIndex(nodes, edges);
  const roots = rootNodes(nodes, edges);
  const depths = new Map<string, number>();
  const queue: Array<{ id: string; depth: number }> = roots.map(r => ({ id: r.id, depth: 0 }));

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    if (depths.has(id)) continue; // cycle guard
    depths.set(id, depth);
    for (const c of idx.childIds.get(id) ?? []) {
      queue.push({ id: c, depth: depth + 1 });
    }
  }

  return depths;
}

export function buildTree(nodes: OrgNode[], edges: OrgEdge[]): TreeNode[] {
  const index = getStructureIndex(nodes, edges);
  const roots = rootNodes(nodes, edges);

  const buildSubtree = (nodeId: string, depth: number): TreeNode => {
    const childIds = index.childIds.get(nodeId) ?? [];
    return {
      id: nodeId,
      depth,
      children: childIds.map(cId => buildSubtree(cId, depth + 1)),
    };
  };

  return roots.map(r => buildSubtree(r.id, 0));
}
