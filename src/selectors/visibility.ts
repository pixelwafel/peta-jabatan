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

export interface DepthGuardResult {
  /** Subset dari `visible` yang lolos batas kedalaman — sama dengan `visible`
   * (referensi yang sama, bukan disalin) kalau tidak melebihi `limit`. */
  guardedVisible: Set<string>;
  /** null kalau guard tidak aktif (di bawah limit); selain itu kedalaman
   * terdalam yang masih ditampilkan. */
  cutoffDepth: number | null;
  /** Berapa banyak node yang disembunyikan guard (0 kalau guard tidak aktif). */
  hiddenCount: number;
}

/**
 * Fase 2.6 — pagar pengaman React Flow: `onlyRenderVisibleElements` (sudah
 * aktif di Canvas.tsx) menghindarkan cost render DOM untuk node di luar
 * viewport, tapi React Flow tetap membukukan (layout/state internal) SETIAP
 * node yang diserahkan lewat prop `nodes` — pembukuan itu degradasi di atas
 * ~2.000 node terlepas dari berapa yang sebenarnya kelihatan di layar.
 * Rencana Fase 2.6: kalau `visible.size` melewati `limit`, potong di
 * kedalaman tertentu (bukan ubah `node.collapsed` — itu data project
 * sungguhan yang ikut undo/persist; ini murni batasan tampilan Preview,
 * dibuang begitu tab ditutup) supaya JUMLAH node yang diserahkan ke React
 * Flow tetap di bawah ambang, dengan banner UI yang menyebutkan berapa node
 * disembunyikan dan tombol untuk menampilkan semua kalau operator benar-benar
 * mau (Canvas.tsx menawarkan itu, fungsi ini murni menghitung potongannya).
 *
 * Algoritma: hitung populasi tiap level kedalaman di antara node visible,
 * lalu ambil level 0..cutoff terbesar yang KUMULATIFnya masih <= limit.
 * Root (depth 0) selalu ikut meski `limit` sangat kecil, supaya guard tidak
 * pernah menghasilkan kanvas kosong total.
 */
export function guardVisibleByDepth(
  visible: Set<string>,
  depths: Map<string, number>,
  limit: number
): DepthGuardResult {
  if (visible.size <= limit) {
    return { guardedVisible: visible, cutoffDepth: null, hiddenCount: 0 };
  }

  const countByDepth = new Map<number, number>();
  for (const id of visible) {
    const d = depths.get(id) ?? 0;
    countByDepth.set(d, (countByDepth.get(d) ?? 0) + 1);
  }
  const sortedDepths = Array.from(countByDepth.keys()).sort((a, b) => a - b);

  let cumulative = 0;
  let cutoff = sortedDepths[0] ?? 0;
  for (const d of sortedDepths) {
    const next = cumulative + (countByDepth.get(d) ?? 0);
    if (next > limit && cumulative > 0) break; // sudah ada minimal 1 level, boleh berhenti
    cumulative = next;
    cutoff = d;
  }

  const guardedVisible = new Set<string>();
  for (const id of visible) {
    if ((depths.get(id) ?? 0) <= cutoff) guardedVisible.add(id);
  }

  return { guardedVisible, cutoffDepth: cutoff, hiddenCount: visible.size - guardedVisible.size };
}
