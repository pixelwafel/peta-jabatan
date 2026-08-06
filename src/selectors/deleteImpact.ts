import { OrgNode } from '@/models/node';
import { OrgEdge } from '@/models/edge';
import { childrenOf, subtreeOf } from './navigation';
import { hierarchyEdges } from '@/utils/edges';

export interface DeleteImpact {
  directChildCount: number;
  /** Jumlah turunan (tidak termasuk node itu sendiri). */
  subtreeCount: number;
  /** true kalau node ini sendiri tidak berinduk — mode "node ini saja" akan
   * membuat anak-anaknya jadi node terpisah tanpa induk sama sekali. */
  hasParent: boolean;
}

/**
 * Hitung dampak menghapus satu node, murni dari nodes/edges — dipakai
 * useDeleteNodeRequest untuk memutuskan apakah perlu dialog pilihan mode
 * (node-only vs subtree) atau cukup konfirmasi sederhana (node tanpa anak).
 * Diekstrak sebagai fungsi murni supaya bisa diuji tanpa React/store.
 */
export function computeDeleteImpact(nodes: OrgNode[], edges: OrgEdge[], id: string): DeleteImpact {
  const directChildCount = childrenOf(nodes, edges, id).length;
  const subtreeCount = subtreeOf(nodes, edges, id).length - 1;
  const hasParent = hierarchyEdges(edges).some(e => e.target === id);

  return { directChildCount, subtreeCount, hasParent };
}
