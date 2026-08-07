import React, { useMemo, useEffect, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Node as RfNode,
  Edge as RfEdge,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { UnitCard } from './cards/UnitCard';
import { JabatanCard } from './cards/JabatanCard';
import { LinkCard } from './cards/LinkCard';
import { HierarchyEdge } from './edges/HierarchyEdge';
import { useProjectStore } from '@/store/projectStore';
import { useUiStore } from '@/store/uiStore';
import { visibleNodeIds, guardVisibleByDepth } from '@/selectors/visibility';
import { hierarchyEdges } from '@/utils/edges';
import { nodeTotals, subtreeTotals } from '@/selectors/totals';
import { isLocked } from '@/selectors/guards';
import { kategoriWarna } from '@/config/resolver';
import { useLiveLayout } from '@/hooks/useLiveLayout';
import { useRecap } from '@/hooks/useRecap';
import { getStructureIndex } from '@/selectors/structureIndex';
import { allDepths } from '@/selectors/navigation';
import { buildTemplateUnitIds, containingTemplateUnitId, countInstancesFor } from '@/selectors/templateInstance';
import { NODE_W, nodeHeight } from '@/utils/layout';
import { Layers } from 'lucide-react';

// Fase 2.6 — di atas ini, React Flow membukukan (bukan cuma render) SETIAP
// node yang diserahkan lewat prop `nodes`, terlepas dari onlyRenderVisibleElements
// (yang cuma menghindarkan cost render DOM, bukan cost pembukuan internal).
// Lihat selectors/visibility.ts guardVisibleByDepth untuk mekanismenya.
const VISIBLE_NODE_GUARD_LIMIT = 1500;

const nodeTypes = {
  unit: UnitCard,
  jabatan: JabatanCard,
  // Link node tetap OrgNode.type === 'unit' di data model (docs/13-link-nodes.md
  // §1) — 'link' di sini murni tipe rendering React Flow, dipilih di bawah
  // berdasarkan node.link, bukan field baru di NodeType.
  link: LinkCard,
};

const edgeTypes = {
  hirarki: HierarchyEdge,
};

const InnerCanvas: React.FC = () => {
  const project = useProjectStore(s => s.project);

  const selectedNodeIds = useUiStore(s => s.selectedNodeIds);
  const selectNodes = useUiStore(s => s.selectNodes);
  const clearSelection = useUiStore(s => s.clearSelection);
  const showJenjangOnCard = useUiStore(s => s.showJenjangOnCard);
  const focusRequest = useUiStore(s => s.focusRequest);
  const clearFocusRequest = useUiStore(s => s.clearFocusRequest);

  const { fitView, setCenter } = useReactFlow();

  const nodes = project?.nodes ?? [];
  const edges = project?.edges ?? [];

  // Rekap sudah instance-aware (docs/15-template-instance.md §3) & link-aware
  // (docs/13-link-nodes.md §3) — kartu canvas pakai peta yang sama supaya
  // angkanya konsisten dengan panel rekap, bukan kalkulasi terpisah yang
  // tidak tahu-menahu soal template/tautan.
  const recap = useRecap();

  // Marker "Σ N satuan" (doc 15 §3): jumlah instance milik template yang
  // menaungi tiap node (dirinya sendiri kalau dia unit template-nya).
  const instanceMarkers = useMemo(() => {
    const map = new Map<string, number>();
    if (nodes.length === 0) return map;
    const idx = getStructureIndex(nodes, edges);
    const templateUnitIds = buildTemplateUnitIds(nodes);
    if (templateUnitIds.size === 0) return map;
    for (const n of nodes) {
      const templateId = containingTemplateUnitId(n.id, idx, templateUnitIds);
      if (templateId) {
        map.set(n.id, countInstancesFor(project?.instances ?? [], templateId));
      }
    }
    return map;
  }, [nodes, edges, project?.instances]);

  // Posisi mode preview: dihitung otomatis dari struktur (Dagre), tidak ada
  // drag manual — murni derived, tidak masuk riwayat undo.
  const liveLayout = useLiveLayout(nodes, edges, {
    direction: 'TB',
    scope: 'all',
    showJenjang: showJenjangOnCard,
  });

  // Konsumsi permintaan fokus (dilempar TreeView/UnplacedPanel/RecapPanel/
  // ReadinessDialog lewat useUiStore.requestFocusNode) — lihat komentar
  // FocusRequest di uiStore.ts. Efek ini HANYA jalan setelah InnerCanvas
  // (dan <ReactFlow> di bawahnya) benar-benar mounted, jadi setCenter aman
  // dipanggil di sini, TIDAK di panel asal.
  useEffect(() => {
    if (!focusRequest) return;
    const target = nodes.find(n => n.id === focusRequest.nodeId);
    if (target) {
      const pos = liveLayout.get(target.id) ?? target.position;
      const h = nodeHeight(target, showJenjangOnCard);
      setCenter(pos.x + NODE_W / 2, pos.y + h / 2, { zoom: 1.2, duration: 300 });
    }
    clearFocusRequest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest]);

  // Fase 1.7 — workaround bug @xyflow/react v12.4.2: kalau <ReactFlow> di-
  // mount dengan sebuah node YANG SUDAH `selected: true` sejak render
  // PERTAMA (mis. operator memilih baris di Outline lalu pindah ke tab
  // Preview — selectedNodeIds sudah terisi sebelum Canvas ini pernah
  // mounted), StoreUpdater masuk infinite-update-loop ("Maximum update depth
  // exceeded"). Memilih node SETELAH mounted (klik kartu di kanvas) tidak
  // bermasalah — cuma kombinasi mount+selected yang macet. `mounted` mulai
  // false supaya render pertama SELALU mengirim `selected:false` ke setiap
  // node; begitu efek di bawah jalan (browser sudah commit DOM pertama),
  // render berikutnya baru membawa `selected` yang sebenarnya — closer ke
  // "select setelah mount", bukan "select saat mount", jadi lolos dari bug.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Compute collapse-aware visible node IDs
  const visible = useMemo(() => {
    return visibleNodeIds(nodes, edges);
  }, [nodes, edges]);

  // Fase 2.6 — pagar pengaman: guard hanya AKTIF (memotong sesuatu) kalau
  // `visible` melebihi VISIBLE_NODE_GUARD_LIMIT; di bawah itu guardedVisible
  // === visible (referensi sama, tidak ada biaya tambahan). `forceShowAll`
  // murni state UI lokal (tidak disimpan/di-undo) — direset tiap ganti
  // project supaya OPD kecil yang dibuka berikutnya tidak mewarisi override
  // OPD besar sebelumnya.
  const [forceShowAll, setForceShowAll] = useState(false);
  useEffect(() => {
    setForceShowAll(false);
  }, [project?.id]);

  const depths = useMemo(() => allDepths(nodes, edges), [nodes, edges]);
  const { guardedVisible, cutoffDepth, hiddenCount } = useMemo(() => {
    if (forceShowAll) return { guardedVisible: visible, cutoffDepth: null, hiddenCount: 0 };
    return guardVisibleByDepth(visible, depths, VISIBLE_NODE_GUARD_LIMIT);
  }, [visible, depths, forceShowAll]);

  // Project store nodes -> React Flow nodes
  const rfNodes: RfNode[] = useMemo(() => {
    // Fase 1.4: idx dihitung SEKALI di luar .map() (cache-hit murah berkat
    // Fase 1.3 kalau nodes/edges sama dengan panggilan lain di render ini),
    // dipakai untuk childCount langsung lewat childIds — dulu childrenOf(...)
    // dipanggil per node di dalam .map(), O(N) per panggilan × N node.
    const idx = getStructureIndex(nodes, edges);
    return nodes
      .filter(n => guardedVisible.has(n.id))
      .map(n => ({
        id: n.id,
        type: n.link ? 'link' : n.type,
        position: liveLayout.get(n.id) ?? n.position,
        data: {
          node: n,
          // Fallback ke kalkulasi lokal (naif, tidak instance/link-aware)
          // cuma untuk jaga-jaga saat recap belum siap (project baru di-set).
          totals: recap?.nodeTotals.get(n.id) ?? nodeTotals(n),
          subtotals:
            n.type === 'unit'
              ? recap?.subtreeTotals.get(n.id) ?? subtreeTotals(nodes, edges, n.id)
              : null,
          childCount: idx.childIds.get(n.id)?.length ?? 0,
          hasFindings: false,
          showJenjang: showJenjangOnCard,
          locked: isLocked(nodes, edges, n.id),
          instanceMarker: instanceMarkers.get(n.id),
        },
        // `mounted` — lihat komentar workaround bug xyflow di atas.
        selected: mounted && selectedNodeIds.includes(n.id),
      }));
  }, [nodes, edges, guardedVisible, selectedNodeIds, showJenjangOnCard, liveLayout, recap, instanceMarkers, mounted]);

  // Fase 1.4: warna MiniMap per node dihitung SEKALI di sini (useMemo), bukan
  // di dalam callback nodeColor React Flow — callback itu dipanggil per node
  // per frame minimap, dan dulu isinya nodes.find(...) per panggilan, jadi
  // O(N) per frame × N node = O(N²) tiap kali minimap redraw.
  const nodeColorById = useMemo(() => {
    const map = new Map<string, string>();
    for (const n of nodes) {
      map.set(n.id, kategoriWarna(n));
    }
    return map;
  }, [nodes]);

  // Project store edges -> React Flow edges
  const rfEdges: RfEdge[] = useMemo(() => {
    return hierarchyEdges(edges)
      .filter(e => guardedVisible.has(e.source) && guardedVisible.has(e.target))
      .map(e => ({
        id: e.id,
        source: e.source,
        target: e.target,
        type: 'hirarki',
        selectable: false,
        focusable: false,
      }));
  }, [edges, guardedVisible]);

  // Fit-view/Escape adalah konsep kanvas (bukan struktur), jadi tetap di sini
  // — shortcut edit (undo/redo, tambah/duplikat/hapus node) sudah pindah ke
  // useStructureShortcuts, dipasang di TreeView.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isInput =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement)?.isContentEditable;

      if (isInput) return;

      // Fit All: Ctrl+0
      if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault();
        fitView({ padding: 0.1, duration: 300 });
        return;
      }

      // Escape: Clear Selection
      if (e.key === 'Escape') {
        clearSelection();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [fitView, clearSelection]);

  return (
    <div className="w-full h-full bg-slate-950 relative select-none">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesDraggable={false}
        onSelectionChange={({ nodes: sel }) => selectNodes(sel.map(n => n.id))}
        selectionOnDrag
        panOnDrag={[1, 2]}
        multiSelectionKeyCode="Shift"
        deleteKeyCode={null}
        nodesConnectable={false}
        onlyRenderVisibleElements
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant="dots" gap={16} color="#334155" />
        <Controls showInteractive={false} />
        <MiniMap
          nodeColor={n => nodeColorById.get(n.id) ?? kategoriWarna(undefined)}
          maskColor="rgba(15, 23, 42, 0.7)"
          style={{ backgroundColor: '#0f172a' }}
          pannable
          zoomable
        />
      </ReactFlow>
      {cutoffDepth !== null && (
        // Fase 2.6 — banner pagar pengaman: cuma muncul kalau guard benar-benar
        // memotong sesuatu (cutoffDepth !== null). "Tampilkan Semua" adalah
        // pilihan sadar operator, bukan default — struktur >1.500 node
        // ditampilkan utuh bisa terasa berat/nge-freeze di perangkat lemah.
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center space-x-2 px-3 py-1.5 rounded-lg border border-amber-700/60 bg-amber-950/80 backdrop-blur-sm text-amber-200 text-xs shadow-lg">
          <Layers className="w-3.5 h-3.5 flex-shrink-0" />
          <span>
            Struktur besar — {hiddenCount.toLocaleString('id-ID')} node disembunyikan (kedalaman &gt;{' '}
            {cutoffDepth}) supaya kanvas tetap responsif.
          </span>
          <button
            onClick={() => setForceShowAll(true)}
            className="flex-shrink-0 px-2 py-0.5 bg-amber-800/80 hover:bg-amber-700 text-amber-100 rounded font-medium"
          >
            Tampilkan Semua
          </button>
        </div>
      )}
      {!project && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center text-slate-500 max-w-xs px-4">
            <p className="text-sm font-medium text-slate-400">Belum ada project dibuka</p>
            <p className="text-xs mt-1">
              Buka <span className="text-slate-300">Kelola Proyek</span> di toolbar untuk membuat project baru atau mengimpor berkas.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export const Canvas: React.FC = () => {
  return <InnerCanvas />;
};
