export interface NodeTotals {
  kebutuhan: number;
  eksisting: number;
  selisih: number; // eksisting - kebutuhan
}

export interface TreeNode {
  id: string;
  children: TreeNode[];
  depth: number;
}

export type Severity = 'error' | 'warning' | 'info';

export interface Finding {
  code: string;
  severity: Severity;
  message: string;
  nodeId?: string;
  rowNumber?: number;
  field?: string;
}

export interface RecapBucket {
  key: string;
  label: string;
  kebutuhan: number;
  eksisting: number;
  selisih: number;
  nodeCount: number; // positions counted, not rows
  depth?: number; // depth for perUnit indentation
  includesCached?: boolean;
}

export interface Recap {
  total: RecapBucket; // whole agency
  perUnit: RecapBucket[]; // one per unit node, in tree order
  perKategori: RecapBucket[]; // config order, zero buckets included
  perJenjang: RecapBucket[]; // functional only, config order
  unplaced: RecapBucket; // positions with no parent
  nodeTotals: Map<string, NodeTotals>; // own rows only
  subtreeTotals: Map<string, NodeTotals>; // self + descendants
}
