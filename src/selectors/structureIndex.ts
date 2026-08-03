import { OrgNode } from '@/models/node';
import { OrgEdge } from '@/models/edge';
import { hierarchyEdges } from '@/utils/edges';

export interface StructureIndex {
  childIds: Map<string, string[]>;
  parentId: Map<string, string>;
  nodeById: Map<string, OrgNode>;
}

let rebuildCount = 0;
let lastIndex: StructureIndex | null = null;
let lastStructuralKey: string | null = null;

export function getRebuildCount(): number {
  return rebuildCount;
}

export function resetRebuildCount(): void {
  rebuildCount = 0;
  lastIndex = null;
  lastStructuralKey = null;
}

/**
 * Builds the structural adjacency index.
 * Rebuilds ONLY when topology/structure changes (nodes added/removed, parent changes).
 * Position-only updates leave the index intact.
 */
export function getStructureIndex(nodes: OrgNode[], edges: OrgEdge[]): StructureIndex {
  const hEdges = hierarchyEdges(edges);
  
  // Compute structural key ignoring node position
  const nodeKey = nodes.map(n => `${n.id}:${n.type}`).join(';');
  const edgeKey = hEdges.map(e => `${e.source}->${e.target}`).join(';');
  const currentKey = `${nodes.length}:${hEdges.length}|${nodeKey}|${edgeKey}`;

  if (lastIndex && lastStructuralKey === currentKey) {
    // Return cached index, but update nodeById reference map for updated node objects
    const updatedNodeById = new Map(nodes.map(n => [n.id, n]));
    lastIndex = {
      ...lastIndex,
      nodeById: updatedNodeById,
    };
    return lastIndex;
  }

  rebuildCount++;

  const childIds = new Map<string, string[]>(nodes.map(n => [n.id, []]));
  const parentId = new Map<string, string>();
  const nodeById = new Map<string, OrgNode>(nodes.map(n => [n.id, n]));

  for (const e of hEdges) {
    childIds.get(e.source)?.push(e.target);
    parentId.set(e.target, e.source);
  }

  lastStructuralKey = currentKey;
  lastIndex = { childIds, parentId, nodeById };

  return lastIndex;
}
