import { OrgNode } from '@/models/node';
import { OrgEdge } from '@/models/edge';
import { hierarchyEdges } from '@/utils/edges';

export interface StructureIndex {
  childIds: Map<string, string[]>;
  parentId: Map<string, string>;
  nodeById: Map<string, OrgNode>;
}

interface CacheSlot {
  nodes: OrgNode[];
  edges: OrgEdge[];
  // Salinan id->type sebagai PRIMITIF, terpisah dari index.nodeById. Beberapa
  // pemanggil (mis. projectStore.ts subtreeOf(draft.nodes, draft.edges, ...)
  // di dalam recipe commit) memberi array draft Immer — proxy-nya direvoke
  // begitu produce() selesai. Kalau structurallyMatches membaca `.type` dari
  // OBJEK node yang tersimpan di slot lama (index.nodeById VALUES), itu bisa
  // menyentuh proxy yang sudah direvoke dan throw. typeById cuma menyimpan
  // string, jadi aman dibaca kapan pun meski `nodes` sumbernya sudah tidak
  // valid lagi.
  typeById: Map<string, OrgNode['type']>;
  index: StructureIndex;
}

let rebuildCount = 0;

// Fase 1.3 — LRU kecil (bukan satu slot). computeGlobalBreakdown dan
// rebuildIndexFromStorage melooping banyak project BERBEDA secara berurutan;
// satu slot akan rebuild ulang tiap kali berpindah project meski struktur
// project yang sama belum berubah sejak terakhir dibaca. 4 slot cukup untuk
// pola akses yang berselang-seling (mis. preview + outline yang sama-sama
// baca index project aktif dalam satu render pass).
const MAX_SLOTS = 4;
const slots: CacheSlot[] = [];

export function getRebuildCount(): number {
  return rebuildCount;
}

export function resetRebuildCount(): void {
  rebuildCount = 0;
  slots.length = 0;
}

function buildFreshNodeById(nodes: OrgNode[]): Map<string, OrgNode> {
  return new Map(nodes.map(n => [n.id, n]));
}

function buildTypeById(nodes: OrgNode[]): Map<string, OrgNode['type']> {
  const m = new Map<string, OrgNode['type']>();
  for (const n of nodes) m.set(n.id, n.type);
  return m;
}

/**
 * Cocok secara struktural dengan slot (himpunan id+type node sama & hierarchy
 * edge sama) TANPA membangun string — perbandingan Map/Set langsung, O(N+E),
 * bebas alokasi string. SENGAJA tidak peduli urutan node dalam array (beda
 * dari kunci string lama yang order-sensitive): urutan tidak memengaruhi
 * adjacency, jadi mis. renumberFromStructure yang cuma menyortir ulang array
 * tanpa mengubah hierarki tidak perlu memicu rebuild.
 */
function structurallyMatches(nodes: OrgNode[], hEdges: OrgEdge[], slot: CacheSlot): boolean {
  if (nodes.length !== slot.typeById.size) return false;
  if (hEdges.length !== slot.index.parentId.size) return false;
  for (const n of nodes) {
    if (slot.typeById.get(n.id) !== n.type) return false;
  }
  for (const e of hEdges) {
    if (slot.index.parentId.get(e.target) !== e.source) return false;
  }
  return true;
}

function pushSlot(slot: CacheSlot): void {
  slots.unshift(slot);
  if (slots.length > MAX_SLOTS) slots.pop();
}

/**
 * Builds the structural adjacency index.
 * Rebuilds ONLY when topology/structure changes (nodes added/removed, parent changes).
 * Position-only updates (dan edit angka/nama/urutan) leave the index intact.
 */
export function getStructureIndex(nodes: OrgNode[], edges: OrgEdge[]): StructureIndex {
  // (a) Jalur cepat identitas — kasus paling umum: beberapa caller dalam satu
  // render pass memanggil dengan array yang SAMA PERSIS. Tidak ada alokasi
  // sama sekali di jalur ini.
  for (const slot of slots) {
    if (slot.nodes === nodes && slot.edges === edges) {
      if (slot !== slots[0]) {
        slots.splice(slots.indexOf(slot), 1);
        slots.unshift(slot);
      }
      return slot.index;
    }
  }

  const hEdges = hierarchyEdges(edges);

  // (b) Struktur tidak berubah (drag posisi, edit angka/nama, commit apa pun
  // yang tidak menyentuh hierarki) — nodeById TETAP harus di-refresh (Immer
  // bisa mengganti referensi node individual walau himpunan id/type &
  // hierarkinya sama), tapi childIds/parentId dipakai ulang tanpa dibangun
  // ulang, dan rebuildCount TIDAK naik.
  for (const slot of slots) {
    if (structurallyMatches(nodes, hEdges, slot)) {
      const index: StructureIndex = {
        childIds: slot.index.childIds,
        parentId: slot.index.parentId,
        nodeById: buildFreshNodeById(nodes),
      };
      pushSlot({ nodes, edges, typeById: buildTypeById(nodes), index });
      return index;
    }
  }

  // (c) Struktur berubah sungguhan — rebuild penuh.
  rebuildCount++;

  const childIds = new Map<string, string[]>(nodes.map(n => [n.id, []]));
  const parentId = new Map<string, string>();
  const nodeById = buildFreshNodeById(nodes);

  for (const e of hEdges) {
    childIds.get(e.source)?.push(e.target);
    parentId.set(e.target, e.source);
  }

  const index: StructureIndex = { childIds, parentId, nodeById };
  pushSlot({ nodes, edges, typeById: buildTypeById(nodes), index });
  return index;
}
