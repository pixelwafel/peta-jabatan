import { OrgNode } from '@/models/node';
import { NodeTotals } from '@/models/derived';

export interface NodeCardData {
  node: OrgNode;
  totals: NodeTotals;
  subtotals: NodeTotals | null;
  childCount: number;
  hasFindings: boolean;
  showJenjang: boolean;
  locked: boolean; // efektif — sendiri ATAU mengikuti unit induk yang terkunci
  /** Terisi kalau node ini di dalam (atau ADALAH) subtree template — jumlah
   * satuan (instance) template tsb, ditampilkan sebagai marker "Σ N satuan"
   * (docs/15-template-instance.md §3). Angka pada kartu ini adalah SUM
   * lintas satuan, bukan milik satu posisi — read-only by definition. */
  instanceMarker?: number;
}

export interface NodeCardProps {
  id: string;
  data: NodeCardData;
  selected?: boolean;
}
