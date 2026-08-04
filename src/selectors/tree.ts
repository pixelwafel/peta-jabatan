import { OrgNode } from '@/models/node';
import { OrgEdge } from '@/models/edge';
import { TreeNode } from '@/models/derived';
import { getStructureIndex } from './structureIndex';
import { designatedRoot } from './navigation';

export function sortSiblings(
  treeNodes: TreeNode[],
  nodeByIdMap: Map<string, OrgNode>
): TreeNode[] {
  return treeNodes.sort((a, b) => {
    const A = nodeByIdMap.get(a.id);
    const B = nodeByIdMap.get(b.id);
    if (!A || !B) return 0;

    if (typeof A.order === 'number' && typeof B.order === 'number') {
      const byOrder = A.order - B.order;
      if (byOrder !== 0) return byOrder;
    }

    // fallback safety net for any not-yet-normalized data
    return A.nama.localeCompare(B.nama, 'id');
  });
}

export function buildTree(nodes: OrgNode[], edges: OrgEdge[]): TreeNode[] {
  const idx = getStructureIndex(nodes, edges);
  const root = designatedRoot(nodes, edges);
  const roots = root
    ? [root]
    : nodes.filter(n => !idx.parentId.has(n.id));

  const walk = (id: string, depth: number, seen: Set<string>): TreeNode => {
    seen.add(id);
    const rawChildren = (idx.childIds.get(id) ?? [])
      .filter(cid => !seen.has(cid))
      .map(cid => walk(cid, depth + 1, seen));

    const sortedChildren = sortSiblings(rawChildren, idx.nodeById);
    return { id, children: sortedChildren, depth };
  };

  return roots.map(r => walk(r.id, 0, new Set()));
}
