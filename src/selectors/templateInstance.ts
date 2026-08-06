import { OrgNode } from '@/models/node';
import { OrgEdge } from '@/models/edge';
import { UnitInstance } from '@/models/project';
import { NodeTotals } from '@/models/derived';
import { StructureIndex } from './structureIndex';
import { subtreeOf } from './navigation';
import { jenjangLabel } from '@/config/resolver';

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

export interface ColumnBlastRadius {
  instanceCount: number; // satuan yang punya angka non-nol di kolom ini
  totalKebutuhan: number;
  totalEksisting: number;
}

/**
 * Blast radius menghapus satu kolom (docs/15-template-instance.md §2
 * "Structure edits cascade with confirmation" / §7 exit criteria) — dipakai
 * UI (JenjangChips, KepalaUnitEditor) untuk menyatakan secara eksplisit
 * berapa satuan & total angka yang akan hilang SEBELUM operator
 * mengonfirmasi, karena `rincian.kebutuhan`/`kepalaUnit.kebutuhan` di node
 * itu sendiri selalu nol di dalam template (invariant) — mengecek field itu
 * langsung tidak akan pernah mendeteksi data yang sebenarnya ada.
 */
export function columnBlastRadius(
  instances: UnitInstance[],
  templateNodeId: string,
  columnKey: string
): ColumnBlastRadius {
  let instanceCount = 0;
  let totalKebutuhan = 0;
  let totalEksisting = 0;
  for (const inst of instances) {
    if (inst.templateNodeId !== templateNodeId) continue;
    const fig = inst.figures[columnKey];
    if (fig && (fig.kebutuhan !== 0 || fig.eksisting !== 0)) {
      instanceCount++;
      totalKebutuhan += fig.kebutuhan;
      totalEksisting += fig.eksisting;
    }
  }
  return { instanceCount, totalKebutuhan, totalEksisting };
}

export interface TemplateColumnDef {
  key: string; // rincianId, atau id unit untuk kolom kepala unit
  label: string; // label level (kosong kalau kolom kepala unit / posisi 1 baris)
}

export interface TemplateColumnGroup {
  nodeId: string;
  label: string; // nama posisi/kepala unit
  columns: TemplateColumnDef[];
}

/**
 * Kelompok kolom satu template unit (docs/15-template-instance.md §2, §4):
 * satu grup per posisi/kepala unit di subtree-nya, satu kolom per baris
 * rincian (atau satu kolom untuk kepala unit). Dipakai bersama oleh
 * components/instance/InstanceGrid.tsx (grid UI) dan export/matrixExporter.ts
 * (sheet Satuan_<nomor>) supaya definisi kolomnya konsisten di kedua tempat.
 */
export function buildColumnGroups(
  templateNodeId: string,
  nodes: OrgNode[],
  edges: OrgEdge[]
): TemplateColumnGroup[] {
  const groups: TemplateColumnGroup[] = [];
  for (const n of subtreeOf(nodes, edges, templateNodeId)) {
    if (n.type === 'unit' && n.kepalaUnit) {
      groups.push({ nodeId: n.id, label: `Kepala ${n.nama}`, columns: [{ key: n.id, label: '' }] });
    } else if (n.type === 'jabatan' && n.rincian.length > 0) {
      groups.push({
        nodeId: n.id,
        label: n.nama,
        columns: n.rincian.map(r => ({
          key: r.id,
          label: r.jenjangId ? jenjangLabel(r.jenjangId, n.kategoriId) : '',
        })),
      });
    }
  }
  return groups;
}
