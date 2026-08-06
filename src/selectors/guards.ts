import { OrgNode } from '@/models/node';
import { OrgEdge } from '@/models/edge';
import { descendantsOf, childrenOf } from './navigation';
import { getStructureIndex } from './structureIndex';

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
 * Fase 1.4: daftar kandidat parent yang valid untuk `nodeId` — pengganti
 * pola lama `nodes.filter(n => canSetParent(nodes, edges, nodeId, n.id))`
 * (dipakai ParentSelect.tsx) yang memanggil descendantsOf() SEKALI PER
 * KANDIDAT, O(N) per panggilan × N kandidat = O(N²). Di sini descendantsOf
 * dipanggil SEKALI untuk nodeId itu sendiri, hasilnya jadi Set exclusion
 * untuk satu pass filter — O(N) total.
 */
export function validParentOptions(nodes: OrgNode[], edges: OrgEdge[], nodeId: string): OrgNode[] {
  const excluded = new Set(descendantsOf(nodes, edges, nodeId).map(d => d.id));
  excluded.add(nodeId);
  return nodes.filter(n => !excluded.has(n.id));
}

/**
 * Kunci bersifat individual per node — tidak diwarisi dari leluhur. Mengunci
 * sebuah Unit/OPD tidak membuat descendant-nya ikut terkunci; itu hanya
 * dicapai lewat aksi cascade terpisah (lihat `setLocked(..., { cascade: true })`
 * di projectStore) yang menulis `locked: true` eksplisit ke tiap descendant,
 * sehingga tiap node tetap bisa dibuka kuncinya satu-satu.
 */
export function isLocked(nodes: OrgNode[], edges: OrgEdge[], nodeId: string): boolean {
  // Fase 1.4: nodeById.get() (O(1) via getStructureIndex yang sudah
  // ter-cache sejak Fase 1.3) menggantikan nodes.find() (O(N)) — dipanggil
  // di dalam loop per-node di Canvas.tsx & TreeView.tsx, jadi ini yang
  // sebelumnya membuat render Canvas O(N²).
  const node = getStructureIndex(nodes, edges).nodeById.get(nodeId);
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
