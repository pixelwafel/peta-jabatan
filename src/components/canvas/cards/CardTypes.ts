import { OrgNode } from '@/models/node';
import { NodeTotals } from '@/models/derived';

export interface NodeCardData {
  node: OrgNode;
  totals: NodeTotals;
  subtotals: NodeTotals | null;
  childCount: number;
  hasFindings: boolean;
  showJenjang: boolean;
}

export interface NodeCardProps {
  id: string;
  data: NodeCardData;
  selected?: boolean;
}
