import dagre from '@dagrejs/dagre';
import { OrgNode } from '@/models/node';
import { OrgEdge } from '@/models/edge';
import { hierarchyEdges } from '@/utils/edges';
import { subtreeOf } from '@/selectors/navigation';

export const NODE_W = 240;
export const CARD_BASE_H = 84;
export const LINE_H = 20;

export function nodeHeight(n: OrgNode, showJenjang: boolean = false): number {
  let h = CARD_BASE_H;
  if (n.type === 'jabatan' && n.kategoriId) {
    h += LINE_H; // Classification line
  }
  if (n.type === 'unit' && n.kepalaUnit) {
    h += LINE_H; // Kepala unit line
  }
  if (showJenjang && n.rincian.length > 1) {
    const perLine = 2;
    h += LINE_H * Math.ceil(n.rincian.length / perLine);
  }
  return h;
}

export interface TidyOptions {
  direction: 'TB' | 'LR';
  scope: 'all' | 'subtree';
  rootId?: string; // required when scope === 'subtree'
  showJenjang?: boolean;
}

export const snapTo16 = (v: number) => Math.round(v / 16) * 16;

export function computeLayout(
  nodes: OrgNode[],
  edges: OrgEdge[],
  opts: TidyOptions
): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: opts.direction,
    nodesep: 40,
    ranksep: 70,
    marginx: 40,
    marginy: 40,
  });
  g.setDefaultEdgeLabel(() => ({}));

  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const hEdges = hierarchyEdges(edges);

  const scopeIds =
    opts.scope === 'subtree' && opts.rootId
      ? new Set(subtreeOf(nodes, edges, opts.rootId).map(n => n.id))
      : new Set(nodes.map(n => n.id));

  // Determine nodes connected in hierarchy
  const connectedIds = new Set<string>();
  for (const e of hEdges) {
    if (scopeIds.has(e.source) && scopeIds.has(e.target)) {
      connectedIds.add(e.source);
      connectedIds.add(e.target);
    }
  }

  // Set nodes in Dagre graph (only placed/connected nodes or single root)
  for (const id of scopeIds) {
    const n = nodeMap.get(id);
    if (!n) continue;
    // Add to Dagre if connected in tree or if it's the only root
    if (connectedIds.has(n.id) || scopeIds.size === 1) {
      g.setNode(n.id, { width: NODE_W, height: nodeHeight(n, opts.showJenjang) });
    }
  }

  // Set hierarchy edges only
  for (const e of hEdges) {
    if (scopeIds.has(e.source) && scopeIds.has(e.target)) {
      g.setEdge(e.source, e.target);
    }
  }

  dagre.layout(g);

  const out = new Map<string, { x: number; y: number }>();
  let maxX = 0;
  let minY = 0;

  for (const id of scopeIds) {
    const d = g.node(id);
    if (d && d.x !== undefined && d.y !== undefined) {
      const x = snapTo16(d.x - NODE_W / 2);
      const y = snapTo16(d.y - d.height / 2);
      out.set(id, { x, y });
      if (x + NODE_W > maxX) maxX = x + NODE_W;
      if (y < minY) minY = y;
    }
  }

  // Unplaced nodes (nodes not in Dagre tree graph) arranged in a neat column to the right
  const unplacedInScope = nodes.filter(
    n => scopeIds.has(n.id) && !out.has(n.id)
  );

  if (unplacedInScope.length > 0) {
    let unplacedY = minY;
    const unplacedX = snapTo16(maxX + 80);

    for (const uNode of unplacedInScope) {
      out.set(uNode.id, { x: unplacedX, y: snapTo16(unplacedY) });
      unplacedY += nodeHeight(uNode, opts.showJenjang) + 24;
    }
  }

  // Preserving anchor for subtree scope
  if (opts.scope === 'subtree' && opts.rootId && out.has(opts.rootId)) {
    const anchor = nodeMap.get(opts.rootId)?.position ?? { x: 0, y: 0 };
    const computedRoot = out.get(opts.rootId)!;
    const dx = anchor.x - computedRoot.x;
    const dy = anchor.y - computedRoot.y;

    for (const [id, pos] of out.entries()) {
      out.set(id, {
        x: snapTo16(pos.x + dx),
        y: snapTo16(pos.y + dy),
      });
    }
  }

  return out;
}
