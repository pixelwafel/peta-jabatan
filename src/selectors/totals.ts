import { OrgNode } from '@/models/node';
import { OrgEdge } from '@/models/edge';
import { NodeTotals } from '@/models/derived';
import { subtreeOf } from './navigation';

export function nodeTotals(node: OrgNode | null | undefined): NodeTotals {
  if (!node) {
    return { kebutuhan: 0, eksisting: 0, selisih: 0 };
  }

  if (node.type === 'unit') {
    // Kepala unit (struktural) melekat langsung di node Unit — angkanya
    // dihitung sebagai milik unit sendiri, bukan dari node Jabatan terpisah.
    const kebutuhan = node.kepalaUnit?.kebutuhan ?? 0;
    const eksisting = node.kepalaUnit?.eksisting ?? 0;
    return { kebutuhan, eksisting, selisih: eksisting - kebutuhan };
  }

  let kebutuhan = 0;
  let eksisting = 0;

  for (const r of node.rincian) {
    kebutuhan += r.kebutuhan ?? 0;
    eksisting += r.eksisting ?? 0;
  }

  return {
    kebutuhan,
    eksisting,
    selisih: eksisting - kebutuhan,
  };
}

export function subtreeTotals(nodes: OrgNode[], edges: OrgEdge[], nodeId: string): NodeTotals {
  const subNodes = subtreeOf(nodes, edges, nodeId);
  let kebutuhan = 0;
  let eksisting = 0;

  for (const n of subNodes) {
    const t = nodeTotals(n);
    kebutuhan += t.kebutuhan;
    eksisting += t.eksisting;
  }

  return {
    kebutuhan,
    eksisting,
    selisih: eksisting - kebutuhan,
  };
}

export function projectTotals(nodes: OrgNode[]): NodeTotals {
  let kebutuhan = 0;
  let eksisting = 0;

  for (const n of nodes) {
    const t = nodeTotals(n);
    kebutuhan += t.kebutuhan;
    eksisting += t.eksisting;
  }

  return {
    kebutuhan,
    eksisting,
    selisih: eksisting - kebutuhan,
  };
}
