import React, { useMemo, useEffect } from 'react';
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
import { visibleNodeIds } from '@/selectors/visibility';
import { hierarchyEdges } from '@/utils/edges';
import { nodeTotals, subtreeTotals } from '@/selectors/totals';
import { childrenOf } from '@/selectors/navigation';
import { isLocked } from '@/selectors/guards';
import { kategoriWarna } from '@/config/resolver';
import { useLiveLayout } from '@/hooks/useLiveLayout';
import { useRecap } from '@/selectors/recap';
import { getStructureIndex } from '@/selectors/structureIndex';
import { buildTemplateUnitIds, containingTemplateUnitId, countInstancesFor } from '@/selectors/templateInstance';

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

  const { fitView } = useReactFlow();

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

  // Compute collapse-aware visible node IDs
  const visible = useMemo(() => {
    return visibleNodeIds(nodes, edges);
  }, [nodes, edges]);

  // Project store nodes -> React Flow nodes
  const rfNodes: RfNode[] = useMemo(() => {
    return nodes
      .filter(n => visible.has(n.id))
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
          childCount: childrenOf(nodes, edges, n.id).length,
          hasFindings: false,
          showJenjang: showJenjangOnCard,
          locked: isLocked(nodes, edges, n.id),
          instanceMarker: instanceMarkers.get(n.id),
        },
        selected: selectedNodeIds.includes(n.id),
      }));
  }, [nodes, edges, visible, selectedNodeIds, showJenjangOnCard, liveLayout, recap, instanceMarkers]);

  // Project store edges -> React Flow edges
  const rfEdges: RfEdge[] = useMemo(() => {
    return hierarchyEdges(edges)
      .filter(e => visible.has(e.source) && visible.has(e.target))
      .map(e => ({
        id: e.id,
        source: e.source,
        target: e.target,
        type: 'hirarki',
        selectable: false,
        focusable: false,
      }));
  }, [edges, visible]);

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
          nodeColor={n => {
            const orgNode = nodes.find(x => x.id === n.id);
            return kategoriWarna(orgNode);
          }}
          maskColor="rgba(15, 23, 42, 0.7)"
          style={{ backgroundColor: '#0f172a' }}
          pannable
          zoomable
        />
      </ReactFlow>
    </div>
  );
};

export const Canvas: React.FC = () => {
  return <InnerCanvas />;
};
