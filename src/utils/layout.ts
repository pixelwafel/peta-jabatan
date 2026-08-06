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

// ---------------------------------------------------------------------------
// Fase 1.6 — computeLayoutCached: memoize computeLayout pada signature
// GEOMETRI, bukan seluruh Project. Dagre TIDAK perlu dihitung ulang untuk
// edit yang tak mengubah geometri kartu/hirarki (rename, isi rincian, catatan
// keterangan, custom attribute, posisi drag manual) — hanya empat input
// nodeHeight() (type, ada/tidaknya kategoriId, ada/tidaknya kepalaUnit,
// rincian.length) + showJenjang yang memengaruhi ukuran kartu, dan hierarchy
// edge yang memengaruhi topologi. Perbandingan dilakukan elemen-per-elemen
// terhadap signature tersimpan (array primitif), BUKAN kunci string — bebas
// alokasi string besar di jalur yang sering dipanggil (Canvas Preview tab).
//
// Cache TUNGGAL (bukan LRU): hanya satu "live layout" yang genuinely reaktif
// setelah TreeView pindah ke hitung-saat-klik (lihat useLiveLayout.ts) —
// Canvas.tsx satu-satunya pemanggil di render path, dan panggilan on-click
// (TreeView/UnplacedPanel handleFocus) biasanya memakai opts yang identik,
// jadi kemungkinan besar tetap cache HIT kalau dipanggil segera setelah
// Canvas render dengan struktur yang sama.
// ---------------------------------------------------------------------------

type NodeSigEntry = readonly [id: string, type: OrgNode['type'], hasKategori: boolean, hasKepala: boolean, rincianLen: number];
type EdgeSigEntry = readonly [source: string, target: string];

interface LayoutCacheEntry {
  direction: TidyOptions['direction'];
  scope: TidyOptions['scope'];
  rootId: string | undefined;
  showJenjang: boolean;
  nodeSig: NodeSigEntry[];
  edgeSig: EdgeSigEntry[];
  result: Map<string, { x: number; y: number }>;
}

let layoutCache: LayoutCacheEntry | null = null;

function nodeSigMatches(nodes: OrgNode[], sig: NodeSigEntry[]): boolean {
  if (nodes.length !== sig.length) return false;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    const [id, type, hasKategori, hasKepala, rincianLen] = sig[i];
    if (
      n.id !== id ||
      n.type !== type ||
      !!n.kategoriId !== hasKategori ||
      !!n.kepalaUnit !== hasKepala ||
      n.rincian.length !== rincianLen
    ) {
      return false;
    }
  }
  return true;
}

function edgeSigMatches(hEdges: OrgEdge[], sig: EdgeSigEntry[]): boolean {
  if (hEdges.length !== sig.length) return false;
  for (let i = 0; i < hEdges.length; i++) {
    const [source, target] = sig[i];
    if (hEdges[i].source !== source || hEdges[i].target !== target) return false;
  }
  return true;
}

export function computeLayoutCached(
  nodes: OrgNode[],
  edges: OrgEdge[],
  opts: TidyOptions
): Map<string, { x: number; y: number }> {
  const showJenjang = opts.showJenjang ?? false;
  const hEdges = hierarchyEdges(edges);

  // scope:'subtree' menjangkarkan hasil ke position node root (lihat blok
  // "Preserving anchor" di atas) — geometrySignature sengaja mengabaikan
  // position, jadi cache tidak aman dipakai untuk mode ini. Tidak ada
  // pemanggil aktif yang memakai scope:'subtree' saat ini; kalau nanti ada,
  // ini cukup jadi jalur "selalu hitung ulang", bukan bug diam-diam.
  if (
    opts.scope !== 'subtree' &&
    layoutCache &&
    layoutCache.direction === opts.direction &&
    layoutCache.scope === opts.scope &&
    layoutCache.rootId === opts.rootId &&
    layoutCache.showJenjang === showJenjang &&
    nodeSigMatches(nodes, layoutCache.nodeSig) &&
    edgeSigMatches(hEdges, layoutCache.edgeSig)
  ) {
    return layoutCache.result;
  }

  const result = computeLayout(nodes, edges, opts);

  if (opts.scope !== 'subtree') {
    layoutCache = {
      direction: opts.direction,
      scope: opts.scope,
      rootId: opts.rootId,
      showJenjang,
      nodeSig: nodes.map(n => [n.id, n.type, !!n.kategoriId, !!n.kepalaUnit, n.rincian.length] as const),
      edgeSig: hEdges.map(e => [e.source, e.target] as const),
      result,
    };
  }

  return result;
}

export function resetLayoutCache(): void {
  layoutCache = null;
}
