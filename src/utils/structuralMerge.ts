import { OrgNode } from '@/models/node';
import { OrgEdge } from '@/models/edge';
import { hierarchyEdges } from './edges';

export interface StructuralMergeResult {
  nodes: OrgNode[];
  edges: OrgEdge[];
  mergedCount: number;
  /** Jabatan berkategori struktural yang TIDAK bisa otomatis digabung
   *  (mis. lebih dari satu kepala di unit yang sama) — perlu dirapikan manual. */
  leftoverIds: string[];
}

/**
 * Data lama (sebelum kepala unit melekat ke node Unit) menyimpan posisi
 * struktural sebagai node Jabatan terpisah di bawah unitnya. Migrasi satu
 * kali: lipat node Jabatan berkategori struktural itu ke `unit.kepalaUnit`,
 * lalu hapus node & edge-nya (anak-anaknya, jika ada, dipindah jadi anak
 * langsung unit — sama seperti deleteNode mode 'node-only').
 *
 * Kasus taktentu (lebih dari satu kepala per unit, atau kepala dengan >1
 * baris rincian) TIDAK digabung otomatis — dikembalikan lewat `leftoverIds`
 * supaya pengguna merapikannya manual, alih-alih menebak dan berpotensi
 * membuang data.
 */
export function mergeStrukturalHeadsIntoUnits(
  nodes: OrgNode[],
  edges: OrgEdge[]
): StructuralMergeResult {
  const nodeById = new Map(nodes.map(n => [n.id, n]));
  const childrenByParent = new Map<string, OrgNode[]>();

  for (const e of hierarchyEdges(edges)) {
    const child = nodeById.get(e.target);
    if (!child) continue;
    const list = childrenByParent.get(e.source) ?? [];
    list.push(child);
    childrenByParent.set(e.source, list);
  }

  const updatedUnits = new Map<string, OrgNode>();
  const headToAbsorbingUnit = new Map<string, string>();
  const leftoverIds: string[] = [];

  for (const unit of nodes) {
    if (unit.type !== 'unit' || unit.kepalaUnit) continue;

    const children = childrenByParent.get(unit.id) ?? [];
    const strukturalChildren = children.filter(
      c => c.type === 'jabatan' && c.kategoriId === 'struktural'
    );

    if (strukturalChildren.length === 0) continue;

    if (strukturalChildren.length > 1) {
      leftoverIds.push(...strukturalChildren.map(c => c.id));
      continue;
    }

    const head = strukturalChildren[0];
    if (head.rincian.length > 1) {
      leftoverIds.push(head.id);
      continue;
    }

    const row = head.rincian[0];
    updatedUnits.set(unit.id, {
      ...unit,
      kepalaUnit: {
        nama: head.nama,
        kode: head.kode,
        jenjangId: row?.jenjangId ?? null,
        kebutuhan: row?.kebutuhan ?? 0,
        eksisting: row?.eksisting ?? 0,
      },
    });
    headToAbsorbingUnit.set(head.id, unit.id);
  }

  if (headToAbsorbingUnit.size === 0) {
    return { nodes, edges, mergedCount: 0, leftoverIds };
  }

  const removedIds = new Set(headToAbsorbingUnit.keys());

  const resultNodes = nodes
    .filter(n => !removedIds.has(n.id))
    .map(n => updatedUnits.get(n.id) ?? n);

  const resultEdges: OrgEdge[] = [];
  for (const e of edges) {
    if (e.kind !== 'hirarki') {
      if (removedIds.has(e.source) || removedIds.has(e.target)) continue;
      resultEdges.push(e);
      continue;
    }

    if (removedIds.has(e.target)) {
      continue; // edge menuju kepala yang dihapus
    }

    if (removedIds.has(e.source)) {
      // Anak dari kepala (jarang, tapi mungkin) dipindah jadi anak unit
      resultEdges.push({ ...e, source: headToAbsorbingUnit.get(e.source)! });
      continue;
    }

    resultEdges.push(e);
  }

  return {
    nodes: resultNodes,
    edges: resultEdges,
    mergedCount: headToAbsorbingUnit.size,
    leftoverIds,
  };
}
