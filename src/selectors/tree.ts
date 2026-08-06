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

export interface FlatTreeRow {
  id: string;
  depth: number;
  hasChildren: boolean;
}

/**
 * Fase 2.5 — meratakan `TreeNode[]` (hasil buildTree, bercabang) jadi satu
 * array baris top-down, melompati subtree node yang `collapsed` (persis
 * kondisi yang dulu diputuskan lewat rekursi `!node.collapsed && children.map(...)`
 * di komponen tree/TreeView.tsx). Dipisah jadi selector murni supaya
 * TreeView bisa mem-virtualisasi (windowing lewat utils/virtualization.ts,
 * pola sama seperti InstanceGrid.tsx) tanpa perlu me-render SELURUH pohon ke
 * DOM sekaligus — cuma baris di viewport yang dirender.
 *
 * `hasChildren` dihitung dari `t.children.length` (struktur PENUH, sebelum
 * collapse dipertimbangkan) — bukan dari jumlah baris yang akhirnya
 * ditampilkan — supaya node yang collapsed tetap menunjukkan chevron untuk
 * dibuka lagi.
 */
export function flattenVisibleTree(tree: TreeNode[], nodeById: Map<string, OrgNode>): FlatTreeRow[] {
  const rows: FlatTreeRow[] = [];
  const walk = (list: TreeNode[]) => {
    for (const t of list) {
      const node = nodeById.get(t.id);
      rows.push({ id: t.id, depth: t.depth, hasChildren: t.children.length > 0 });
      if (t.children.length > 0 && !node?.collapsed) {
        walk(t.children);
      }
    }
  };
  walk(tree);
  return rows;
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
