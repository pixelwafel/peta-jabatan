import { OrgNode } from '@/models/node';
import { OrgEdge } from '@/models/edge';
import { rootNodes } from './navigation';
import { getStructureIndex } from './structureIndex';

/**
 * Fase 1.4: satu BFS top-down dari root/orphan lewat idx.childIds, O(N)
 * total. Dulu tiap node memanggil isHiddenByCollapse -> ancestorsOf() sendiri
 * (O(depth) per node), dijumlah atas N node jadi O(N·depth). Node yang
 * dirinya sendiri collapsed TETAP masuk (visible) — cuma descendant-nya yang
 * tidak dijelajahi lebih lanjut (persis semantik isHiddenByCollapse lama:
 * ancestors.some(a.collapsed), bukan termasuk diri sendiri).
 */
export function visibleNodeIds(nodes: OrgNode[], edges: OrgEdge[]): Set<string> {
  const idx = getStructureIndex(nodes, edges);
  const visible = new Set<string>();
  const queue: string[] = rootNodes(nodes, edges).map(r => r.id);

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visible.has(id)) continue; // cycle guard
    visible.add(id);
    const node = idx.nodeById.get(id);
    if (node?.collapsed) continue; // jangan jelajahi subtree yang ditutup
    for (const c of idx.childIds.get(id) ?? []) {
      queue.push(c);
    }
  }

  return visible;
}

/** Convenience single-node check, dibangun dari visibleNodeIds. Kalau perlu
 * mengecek banyak node, panggil visibleNodeIds() sekali dan cek membership —
 * jangan panggil ini di dalam loop (itu akan membangun ulang seluruh Set
 * tiap panggilan). */
export function isHiddenByCollapse(nodes: OrgNode[], edges: OrgEdge[], nodeId: string): boolean {
  return !visibleNodeIds(nodes, edges).has(nodeId);
}
