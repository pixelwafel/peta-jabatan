import React from 'react';
import { ChevronRight, ChevronLeft, Sliders } from 'lucide-react';
import { useUiStore } from '@/store/uiStore';
import { useProjectStore } from '@/store/projectStore';
import { isLocked } from '@/selectors/guards';
import { ProjectMetaForm } from '../property/ProjectMetaForm';
import { SingleNodeForm } from '../property/SingleNodeForm';
import { MultiSelectionPanel } from '../property/MultiSelectionPanel';
import { ConfirmModal } from '../common/ConfirmModal';
import { ResizeHandle } from './ResizeHandle';

interface RightSidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  width: number;
  onResizeDrag: (clientX: number) => void;
}

export const RightSidebar: React.FC<RightSidebarProps> = ({
  collapsed,
  onToggleCollapse,
  width,
  onResizeDrag,
}) => {
  const selectedNodeIds = useUiStore(s => s.selectedNodeIds);

  // Selector subscription discipline: lookup selected node by id
  const selectedNode = useProjectStore(s => {
    if (selectedNodeIds.length !== 1) return null;
    return s.project?.nodes.find(n => n.id === selectedNodeIds[0]) ?? null;
  });

  const selectedNodeLocked = useProjectStore(s => {
    if (selectedNodeIds.length !== 1 || !s.project) return false;
    return isLocked(s.project.nodes, s.project.edges, selectedNodeIds[0]);
  });

  if (collapsed) {
    return (
      <aside className="w-[36px] bg-slate-900 border-l border-slate-700 flex flex-col items-center py-2 space-y-4 text-slate-400 select-none">
        <button
          onClick={onToggleCollapse}
          className="p-1 hover:text-slate-100 hover:bg-slate-800 rounded"
          title="Buka Panel Properti"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          onClick={onToggleCollapse}
          className="p-1 text-slate-400 hover:text-slate-200 rounded"
          title="Panel Properti Node"
        >
          <Sliders className="w-4 h-4" />
        </button>
      </aside>
    );
  }

  return (
    <>
      <aside
        className="relative min-h-0 bg-slate-900 border-l border-slate-700 flex flex-col h-full select-none text-slate-300"
        style={{ width: `${width}px` }}
      >
        <ResizeHandle side="left" onDrag={onResizeDrag} />
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2 flex-shrink-0">
          <div className="flex items-center space-x-2 font-medium text-sm text-slate-200">
            <Sliders className="w-4 h-4 text-blue-400" />
            <span>Properti &amp; Detail</span>
          </div>
          <button
            onClick={onToggleCollapse}
            className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-200"
            title="Tutup Panel Properti"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Dynamic Panel Content based on selection count */}
        <div className="flex-1 min-h-0 overflow-y-auto p-3 text-xs space-y-4">
          {selectedNodeIds.length === 0 && <ProjectMetaForm />}
          {selectedNodeIds.length === 1 && selectedNode && (
            <SingleNodeForm node={selectedNode} locked={selectedNodeLocked} />
          )}
          {selectedNodeIds.length > 1 && <MultiSelectionPanel />}
        </div>
      </aside>

      {/* Confirmation Modal Container */}
      <ConfirmModal />
    </>
  );
};
