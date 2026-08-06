import { OrgNode } from '@/models/node';
import { UnitInstance } from '@/models/project';
import { NodeTotals } from '@/models/derived';
import { StructureIndex } from './structureIndex';

/** Semua node id unit yang `isTemplate === true` (docs/15-template-instance.md §1). */
export function buildTemplateUnitIds(nodes: OrgNode[]): Set<string> {
  return new Set(nodes.filter(n => n.isTemplate).map(n => n.id));
}

/**
 * Template unit yang menaungi `nodeId` (docs/15 §3): dirinya sendiri kalau
 * `nodeId` itu sendiri sebuah template unit, atau leluhur terdekat yang
 * `isTemplate` lewat rantai parentId. `null` kalau tidak di dalam subtree
 * template mana pun.
 *
 * **Catatan adaptasi dari doc 15**: doc mengasumsikan model generik tempat
 * "kepala sekolah" adalah baris rincian biasa. Di app ini kepala unit
 * melekat langsung pada `OrgNode.kepalaUnit` (lihat models/node.ts), bukan
 * node Jabatan terpisah — jadi kolom "Kepsek" di grid instance (docs/15 §2
 * contoh grid) mengacu ke `instance.figures[templateNodeId]` (id unit
 * template itu sendiri dipakai sebagai kunci kolom), BUKAN sebuah
 * `rincianId` terpisah — id unit tidak pernah bentrok dengan uuid Rincian
 * mana pun jadi aman dipakai bersamaan sebagai kunci `figures`.
 */
export function containingTemplateUnitId(
  nodeId: string,
  idx: StructureIndex,
  templateUnitIds: Set<string>
): string | null {
  if (templateUnitIds.has(nodeId)) return nodeId;

  let current = idx.parentId.get(nodeId);
  const visited = new Set<string>();
  while (current) {
    if (visited.has(current)) return null; // cycle guard, sama seperti selectors/recap.ts
    visited.add(current);
    if (templateUnitIds.has(current)) return current;
    current = idx.parentId.get(current);
  }
  return null;
}

/** true kalau `nodeId` (posisi, sub-unit, atau template unit itu sendiri) ada di dalam/ADALAH subtree template. */
export function isInTemplateSubtree(
  nodeId: string,
  idx: StructureIndex,
  templateUnitIds: Set<string>
): boolean {
  return containingTemplateUnitId(nodeId, idx, templateUnitIds) !== null;
}

/**
 * Total per kolom (`rincianId`, atau id unit template sendiri untuk kolom
 * kepala unit) untuk SATU template unit — jumlah `figures` seluruh instance
 * miliknya (docs/15 §3 `templateColumnTotal`). Instance milik template unit
 * LAIN (kalau project punya >1 template, doc 15 §6) diabaikan.
 */
export function computeInstanceTotals(
  instances: UnitInstance[],
  templateNodeId: string
): Map<string, NodeTotals> {
  const acc = new Map<string, { keb: number; eks: number }>();

  for (const inst of instances) {
    if (inst.templateNodeId !== templateNodeId) continue;
    for (const [columnKey, fig] of Object.entries(inst.figures)) {
      const prev = acc.get(columnKey) ?? { keb: 0, eks: 0 };
      prev.keb += fig.kebutuhan ?? 0;
      prev.eks += fig.eksisting ?? 0;
      acc.set(columnKey, prev);
    }
  }

  const result = new Map<string, NodeTotals>();
  for (const [key, { keb, eks }] of acc.entries()) {
    result.set(key, { kebutuhan: keb, eksisting: eks, selisih: eks - keb });
  }
  return result;
}

/** Jumlah semua kolom milik satu template unit — dipakai sebagai subtree total-nya di recap (doc 15 §3). */
export function sumInstanceTotals(columnTotals: Map<string, NodeTotals>): NodeTotals {
  let kebutuhan = 0;
  let eksisting = 0;
  for (const t of columnTotals.values()) {
    kebutuhan += t.kebutuhan;
    eksisting += t.eksisting;
  }
  return { kebutuhan, eksisting, selisih: eksisting - kebutuhan };
}

/** Jumlah instance yang tercatat untuk satu template unit — dipakai untuk marker "N satuan" (doc 15 §3). */
export function countInstancesFor(instances: UnitInstance[], templateNodeId: string): number {
  return instances.filter(i => i.templateNodeId === templateNodeId).length;
}
