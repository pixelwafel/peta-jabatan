import { OrgNode } from '@/models/node';
import { OrgEdge } from '@/models/edge';
import { ancestorsOf } from './navigation';

export function isHiddenByCollapse(nodes: OrgNode[], edges: OrgEdge[], nodeId: string): boolean {
  const ancestors = ancestorsOf(nodes, edges, nodeId);
  return ancestors.some(a => a.collapsed);
}

export function visibleNodeIds(nodes: OrgNode[], edges: OrgEdge[]): Set<string> {
  const visible = new Set<string>();

  for (const n of nodes) {
    if (!isHiddenByCollapse(nodes, edges, n.id)) {
      visible.add(n.id);
    }
  }

  return visible;
}
