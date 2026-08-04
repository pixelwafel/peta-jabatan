import { OrgNode } from '@/models/node';
import { OrgEdge } from '@/models/edge';
import { descendantsOf, childrenOf } from './navigation';

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
 * Kunci bersifat individual per node — tidak diwarisi dari leluhur. Mengunci
 * sebuah Unit/OPD tidak membuat descendant-nya ikut terkunci; itu hanya
 * dicapai lewat aksi cascade terpisah (lihat `setLocked(..., { cascade: true })`
 * di projectStore) yang menulis `locked: true` eksplisit ke tiap descendant,
 * sehingga tiap node tetap bisa dibuka kuncinya satu-satu.
 */
export function isLocked(nodes: OrgNode[], _edges: OrgEdge[], nodeId: string): boolean {
  const node = nodes.find(n => n.id === nodeId);
  return node?.locked === true;
}

/** true kalau node itu sendiri ATAU salah satu descendant-nya terkunci. */
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
