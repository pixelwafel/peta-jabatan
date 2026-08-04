import { OrgNode } from '@/models/node';
import { OrgEdge } from '@/models/edge';
import { descendantsOf, childrenOf, ancestorsOf } from './navigation';

/**
 * Invariant 4: No cycles in hierarchy edges.
 * Returns false if parentId is self or a descendant of childId.
 */
export function canSetParent(
  nodes: OrgNode[],
  edges: OrgEdge[],
  childId: string,
  parentId: string | null
): boolean {
  if (!parentId) return true;
  if (childId === parentId) return false;

  const childDescendants = descendantsOf(nodes, edges, childId);
  if (childDescendants.some(d => d.id === parentId)) {
    return false;
  }

  return true;
}

/**
 * Terkunci sendiri, ATAU salah satu leluhurnya terkunci (kunci di level Unit
 * otomatis melindungi seluruh cabang di bawahnya). Tidak menulis `locked` ke
 * tiap descendant — dihitung on-the-fly supaya membuka kunci unit induk
 * otomatis membuka semua yang cuma "terlindungi ikutan", sementara node yang
 * dikunci sendiri (locked eksplisit) tetap terkunci.
 */
export function isLocked(nodes: OrgNode[], edges: OrgEdge[], nodeId: string): boolean {
  const node = nodes.find(n => n.id === nodeId);
  if (node?.locked) return true;
  return ancestorsOf(nodes, edges, nodeId).some(a => a.locked);
}

/** true kalau node itu sendiri ATAU salah satu descendant-nya terkunci sendiri. */
export function isSubtreeLocked(nodes: OrgNode[], edges: OrgEdge[], nodeId: string): boolean {
  if (isLocked(nodes, edges, nodeId)) return true;
  return descendantsOf(nodes, edges, nodeId).some(d => d.locked);
}

export function canDelete(
  nodes: OrgNode[],
  edges: OrgEdge[],
  nodeId: string
): { ok: boolean; childCount: number } {
  const directChildren = childrenOf(nodes, edges, nodeId);
  return {
    ok: true,
    childCount: directChildren.length,
  };
}
