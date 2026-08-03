import { OrgNode } from '@/models/node';
import { OrgEdge } from '@/models/edge';
import { TreeNode } from '@/models/derived';
import { getStructureIndex } from './structureIndex';
import { designatedRoot } from './navigation';
import { compareNomor } from '@/utils/numbering';

export function sortSiblings(
  treeNodes: TreeNode[],
  nodeByIdMap: Map<string, OrgNode>
): TreeNode[] {
  return treeNodes.sort((a, b) => {
    const A = nodeByIdMap.get(a.id);
    const B = nodeByIdMap.get(b.id);
    if (!A || !B) return 0;

    if (A.nomor && B.nomor) {
      const byNomor = compareNomor(A.nomor, B.nomor);
      if (byNomor !== 0) return byNomor;
    }

    const byX = A.position.x - B.position.x;
    if (Math.abs(byX) > 8) return byX; // 8px tolerance prevents tree reordering on small nudges

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
