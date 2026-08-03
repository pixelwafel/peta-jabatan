import React, { useMemo, useRef, useCallback, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  NodeChange,
  applyNodeChanges,
  Node as RfNode,
  Edge as RfEdge,
  useReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { UnitCard } from './cards/UnitCard';
import { JabatanCard } from './cards/JabatanCard';
import { HierarchyEdge } from './edges/HierarchyEdge';
import { useProjectStore } from '@/store/projectStore';
import { useUiStore } from '@/store/uiStore';
import { visibleNodeIds } from '@/selectors/visibility';
import { hierarchyEdges } from '@/utils/edges';
import { nodeTotals, subtreeTotals } from '@/selectors/totals';
import { childrenOf } from '@/selectors/navigation';
import { kategoriWarna } from '@/config/resolver';
import { snapTo16 } from '@/utils/layout';
import { uuid } from '@/utils/uuid';
import { useHistoryStore } from '@/store/historyStore';

const nodeTypes = {
  unit: UnitCard,
  jabatan: JabatanCard,
};

const edgeTypes = {
  hirarki: HierarchyEdge,
};

const InnerCanvas: React.FC = () => {
  const project = useProjectStore(s => s.project);
  const moveNodes = useProjectStore(s => s.moveNodes);
  const addNode = useProjectStore(s => s.addNode);
  const duplicateNode = useProjectStore(s => s.duplicateNode);
  const deleteNode = useProjectStore(s => s.deleteNode);
  const undo = useProjectStore(s => s.undo);
  const redo = useProjectStore(s => s.redo);

  const selectedNodeIds = useUiStore(s => s.selectedNodeIds);
  const selectNodes = useUiStore(s => s.selectNodes);
  const clearSelection = useUiStore(s => s.clearSelection);
  const showJenjangOnCard = useUiStore(s => s.showJenjangOnCard);

  const { fitView } = useReactFlow();
  const dragSession = useRef<string | null>(null);

  const nodes = project?.nodes ?? [];
  const edges = project?.edges ?? [];

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
        type: n.type,
        position: n.position,
        data: {
          node: n,
          totals: nodeTotals(n),
          subtotals: n.type === 'unit' ? subtreeTotals(nodes, edges, n.id) : null,
          childCount: childrenOf(nodes, edges, n.id).length,
          hasFindings: false,
          showJenjang: showJenjangOnCard,
        },
        selected: selectedNodeIds.includes(n.id),
      }));
  }, [nodes, edges, visible, selectedNodeIds, showJenjangOnCard]);

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

  const handleDragStart = useCallback(() => {
    dragSession.current = `drag:${uuid()}`;
  }, []);

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      // Let React Flow update position state internally during drag
      // Do NOT commit at frame rate!
      applyNodeChanges(changes, rfNodes);
    },
    [rfNodes]
  );

  const handleDragStop = useCallback(
    (_evt: React.MouseEvent, _node: RfNode, draggedNodes: RfNode[]) => {
      if (!dragSession.current) return;
      const moves = draggedNodes.map(n => ({
        id: n.id,
        position: { x: snapTo16(n.position.x), y: snapTo16(n.position.y) },
      }));
      moveNodes(moves, dragSession.current);
      useHistoryStore.getState().closePending();
      dragSession.current = null;
    },
    [moveNodes]
  );

  // Keyboard Shortcuts Handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isInput =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement)?.isContentEditable;

      if (isInput) return; // Don't intercept typing in inputs

      // Undo / Redo
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }

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

      // Actions requiring a selected node
      const primarySelected = selectedNodeIds[0];

      if (primarySelected) {
        // Tab: Add Child
        if (e.key === 'Tab') {
          e.preventDefault();
          addNode({ type: 'jabatan', parentId: primarySelected });
          return;
        }

        // Enter: Add Sibling
        if (e.key === 'Enter') {
          e.preventDefault();
          const parentEdge = hierarchyEdges(edges).find(eg => eg.target === primarySelected);
          const parentId = parentEdge?.source;
          addNode({ type: 'jabatan', parentId });
          return;
        }

        // Ctrl+D: Duplicate Node
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd' && !e.shiftKey) {
          e.preventDefault();
          duplicateNode(primarySelected, 'node-only');
          return;
        }

        // Ctrl+Shift+D: Duplicate Subtree
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd' && e.shiftKey) {
          e.preventDefault();
          duplicateNode(primarySelected, 'subtree');
          return;
        }

        // Delete / Backspace
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          deleteNode(primarySelected, 'node-only');
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    selectedNodeIds,
    edges,
    addNode,
    duplicateNode,
    deleteNode,
    undo,
    redo,
    fitView,
    clearSelection,
  ]);

  return (
    <div className="w-full h-full bg-slate-950 relative select-none">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={handleNodesChange}
        onNodeDragStart={handleDragStart}
        onNodeDragStop={handleDragStop}
        onSelectionChange={({ nodes: sel }) => selectNodes(sel.map(n => n.id))}
        snapToGrid
        snapGrid={[16, 16]}
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
