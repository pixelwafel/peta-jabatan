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
