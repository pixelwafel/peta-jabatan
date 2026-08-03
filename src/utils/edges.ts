import { OrgEdge } from '@/models/edge';

/**
 * Filter edges to only hierarchy edges ('hirarki').
 * Enforces Invariant 5 / Constraint 5 across the codebase.
 */
export const hierarchyEdges = (edges: OrgEdge[]): OrgEdge[] =>
  edges.filter(e => e.kind === 'hirarki');
