import React, { useMemo, useState } from 'react';
import { useProjectStore } from '@/store/projectStore';
import { useUiStore } from '@/store/uiStore';
import { buildTree } from '@/selectors/tree';
import { TreeNode } from '@/models/derived';
import { OrgNode } from '@/models/node';
import { ancestorsOf, childrenOf, parentOf, rootNodes } from '@/selectors/navigation';
import { NODE_W, nodeHeight } from '@/utils/layout';
import { useReactFlow } from '@xyflow/react';
import { useStructureShortcuts } from '@/hooks/useStructureShortcuts';
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FileText,
  Plus,
  CornerDownRight,
  Copy,
  Trash2,
} from 'lucide-react';

type DropPosition = 'before' | 'after' | 'inside';

interface DropIndicator {
  id: string;
  position: DropPosition;
}

function computeDropPosition(e: React.DragEvent, rect: DOMRect): DropPosition {
  const relY = (e.clientY - rect.top) / rect.height;
  if (relY < 0.25) return 'before';
  if (relY > 0.75) return 'after';
  return 'inside';
}

interface TreeRowProps {
  treeNode: TreeNode;
  nodeByIdMap: Map<string, OrgNode>;
  selectedIds: string[];
  editingId: string | null;
  dropIndicator: DropIndicator | null;
  onFocus: (id: string) => void;
  onToggleCollapse: (id: string) => void;
  onStartRename: (id: string) => void;
  onCommitRename: (id: string, nama: string) => void;
  onCancelRename: () => void;
  onAddChild: (id: string) => void;
  onAddSibling: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onDragStartRow: (id: string) => void;
  onDragOverRow: (id: string, position: DropPosition) => void;
  onDragEndRow: () => void;
  onDropRow: (id: string, position: DropPosition) => void;
}

const TreeRow: React.FC<TreeRowProps> = ({
  treeNode,
  nodeByIdMap,
  selectedIds,
  editingId,
  dropIndicator,
  onFocus,
  onToggleCollapse,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onAddChild,
  onAddSibling,
  onDuplicate,
  onDelete,
  onDragStartRow,
  onDragOverRow,
  onDragEndRow,
  onDropRow,
}) => {
  const node = nodeByIdMap.get(treeNode.id);
  if (!node) return null;

  const isSelected = selectedIds.includes(node.id);
  const isUnit = node.type === 'unit';
  const hasChildren = treeNode.children.length > 0;
  const isEditing = editingId === node.id;
  const isDropTarget = dropIndicator?.id === node.id;

  // Calculate figures summary
  const keb = node.rincian.reduce((acc, r) => acc + r.kebutuhan, 0);
  const eks = node.rincian.reduce((acc, r) => acc + r.eksisting, 0);

  return (
    <div className="space-y-0.5 select-none font-mono">
      <div
        draggable={!isEditing}
        onDragStart={e => {
          e.dataTransfer.setData('text/plain', node.id);
          e.dataTransfer.effectAllowed = 'move';
          onDragStartRow(node.id);
        }}
        onDragOver={e => {
          e.preventDefault();
          const rect = e.currentTarget.getBoundingClientRect();
          onDragOverRow(node.id, computeDropPosition(e, rect));
        }}
        onDragEnd={onDragEndRow}
        onDrop={e => {
          e.preventDefault();
          if (dropIndicator?.id === node.id) {
            onDropRow(node.id, dropIndicator.position);
          }
        }}
        onClick={() => onFocus(node.id)}
        className={`group relative flex items-center justify-between py-1 px-1.5 rounded cursor-pointer transition-colors text-xs ${
          isSelected
            ? 'bg-blue-900/40 text-blue-200 font-semibold'
            : 'hover:bg-slate-800/60 text-slate-300'
        } ${isDropTarget && dropIndicator?.position === 'inside' ? 'ring-1 ring-blue-400' : ''}`}
        style={{ paddingLeft: `${treeNode.depth * 12 + 6}px` }}
      >
        {isDropTarget && dropIndicator?.position === 'before' && (
          <div className="absolute left-0 right-0 top-0 h-0.5 bg-blue-400" />
        )}
        {isDropTarget && dropIndicator?.position === 'after' && (
          <div className="absolute left-0 right-0 bottom-0 h-0.5 bg-blue-400" />
        )}

        <div className="flex items-center space-x-1.5 min-w-0 pr-2">
          {hasChildren ? (
            <button
              onClick={e => {
                e.stopPropagation();
                onToggleCollapse(node.id);
              }}
              className="p-0.5 hover:bg-slate-700 rounded text-slate-400"
            >
              {node.collapsed ? (
                <ChevronRight className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
            </button>
          ) : (
            <span className="w-4 inline-block" />
          )}

          {isUnit ? (
            <Folder className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
          ) : (
            <FileText className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
          )}

          {isEditing ? (
            <input
              autoFocus
              defaultValue={node.nama}
              onClick={e => e.stopPropagation()}
              onBlur={e => onCommitRename(node.id, e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onCommitRename(node.id, e.currentTarget.value);
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  onCancelRename();
                }
              }}
              className="bg-slate-900 border border-blue-500 rounded px-1 py-0.5 text-xs text-slate-100 w-full min-w-0"
            />
          ) : (
            <span
              className="truncate"
              onDoubleClick={e => {
                e.stopPropagation();
                onStartRename(node.id);
              }}
            >
              {node.nomor ? `${node.nomor} · ` : ''}
              {node.nama}
            </span>
          )}
        </div>

        <div className="flex items-center space-x-1 flex-shrink-0">
          {/* Figures Badge */}
          {!isUnit && node.rincian.length > 0 && (
            <span className="text-[10px] text-slate-400 bg-slate-950/60 px-1.5 py-0.5 rounded">
              {keb}/{eks}
            </span>
          )}

          {/* Row action buttons — visible on hover */}
          {!isEditing && (
            <div className="hidden group-hover:flex items-center space-x-0.5">
              <button
                title="Tambah anak"
                onClick={e => {
                  e.stopPropagation();
                  onAddChild(node.id);
                }}
                className="p-0.5 hover:bg-slate-700 rounded text-slate-400"
              >
                <Plus className="w-3 h-3" />
              </button>
              <button
                title="Tambah sibling"
                onClick={e => {
                  e.stopPropagation();
                  onAddSibling(node.id);
                }}
                className="p-0.5 hover:bg-slate-700 rounded text-slate-400"
              >
                <CornerDownRight className="w-3 h-3" />
              </button>
              <button
                title="Duplikat"
                onClick={e => {
                  e.stopPropagation();
                  onDuplicate(node.id);
                }}
                className="p-0.5 hover:bg-slate-700 rounded text-slate-400"
              >
                <Copy className="w-3 h-3" />
              </button>
              <button
                title="Hapus"
                onClick={e => {
                  e.stopPropagation();
                  onDelete(node.id);
                }}
                className="p-0.5 hover:bg-slate-700 rounded text-red-400"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Children render recursively if not collapsed */}
      {!node.collapsed &&
        treeNode.children.map(child => (
          <TreeRow
            key={child.id}
            treeNode={child}
            nodeByIdMap={nodeByIdMap}
            selectedIds={selectedIds}
            editingId={editingId}
            dropIndicator={dropIndicator}
            onFocus={onFocus}
            onToggleCollapse={onToggleCollapse}
            onStartRename={onStartRename}
            onCommitRename={onCommitRename}
            onCancelRename={onCancelRename}
            onAddChild={onAddChild}
            onAddSibling={onAddSibling}
            onDuplicate={onDuplicate}
            onDelete={onDelete}
            onDragStartRow={onDragStartRow}
            onDragOverRow={onDragOverRow}
            onDragEndRow={onDragEndRow}
            onDropRow={onDropRow}
          />
        ))}
    </div>
  );
};

export const TreeView: React.FC = () => {
  useStructureShortcuts();

  const project = useProjectStore(s => s.project);
  const updateNode = useProjectStore(s => s.updateNode);
  const addNode = useProjectStore(s => s.addNode);
  const duplicateNode = useProjectStore(s => s.duplicateNode);
  const deleteNode = useProjectStore(s => s.deleteNode);
  const moveNode = useProjectStore(s => s.moveNode);
  const selectedNodeIds = useUiStore(s => s.selectedNodeIds);
  const selectNodes = useUiStore(s => s.selectNodes);
  const showJenjangOnCard = useUiStore(s => s.showJenjangOnCard);
  const { setCenter } = useReactFlow();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const nodes = project?.nodes ?? [];
  const edges = project?.edges ?? [];

  const tree = useMemo(() => buildTree(nodes, edges), [nodes, edges]);
  const nodeByIdMap = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);

  const handleFocus = (nodeId: string) => {
    // Auto expand collapsed ancestors
    const collapsedAncestors = ancestorsOf(nodes, edges, nodeId).filter(a => a.collapsed);
    if (collapsedAncestors.length > 0) {
      for (const a of collapsedAncestors) {
        updateNode(a.id, { collapsed: false });
      }
    }

    const target = nodeByIdMap.get(nodeId);
    if (target) {
      const h = nodeHeight(target, showJenjangOnCard);
      setCenter(target.position.x + NODE_W / 2, target.position.y + h / 2, {
        zoom: 1.2,
        duration: 300,
      });
      selectNodes([nodeId]);
    }
  };

  const handleToggleCollapse = (nodeId: string) => {
    const node = nodeByIdMap.get(nodeId);
    if (node) {
      updateNode(nodeId, { collapsed: !node.collapsed });
    }
  };

  const handleCommitRename = (nodeId: string, nama: string) => {
    const trimmed = nama.trim();
    if (trimmed) {
      updateNode(nodeId, { nama: trimmed });
    }
    setEditingId(null);
  };

  const handleAddChild = (nodeId: string) => {
    addNode({ type: 'jabatan', parentId: nodeId });
  };

  const handleAddSibling = (nodeId: string) => {
    const parentId = parentOf(nodes, edges, nodeId)?.id;
    addNode({ type: 'jabatan', parentId });
  };

  const handleDrop = (targetId: string, position: DropPosition) => {
    const dId = draggedId;
    setDraggedId(null);
    setDropIndicator(null);
    if (!dId || dId === targetId) return;

    if (position === 'inside') {
      moveNode(dId, targetId, 0);
      return;
    }

    const targetParentId = parentOf(nodes, edges, targetId)?.id ?? null;
    const siblings = (
      targetParentId ? childrenOf(nodes, edges, targetParentId) : rootNodes(nodes, edges)
    )
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const targetIndex = siblings.findIndex(s => s.id === targetId);
    const insertIndex = position === 'after' ? targetIndex + 1 : targetIndex;
    moveNode(dId, targetParentId, insertIndex);
  };

  if (nodes.length === 0) {
    return (
      <div className="p-4 text-center text-slate-500 italic text-xs">
        Tidak ada node dalam struktur.
      </div>
    );
  }

  return (
    <div className="space-y-1 py-1">
      {tree.map(treeNode => (
        <TreeRow
          key={treeNode.id}
          treeNode={treeNode}
          nodeByIdMap={nodeByIdMap}
          selectedIds={selectedNodeIds}
          editingId={editingId}
          dropIndicator={dropIndicator}
          onFocus={handleFocus}
          onToggleCollapse={handleToggleCollapse}
          onStartRename={setEditingId}
          onCommitRename={handleCommitRename}
          onCancelRename={() => setEditingId(null)}
          onAddChild={handleAddChild}
          onAddSibling={handleAddSibling}
          onDuplicate={id => duplicateNode(id, 'node-only')}
          onDelete={id => deleteNode(id, 'node-only')}
          onDragStartRow={setDraggedId}
          onDragOverRow={(id, position) => setDropIndicator({ id, position })}
          onDragEndRow={() => {
            setDraggedId(null);
            setDropIndicator(null);
          }}
          onDropRow={handleDrop}
        />
      ))}
    </div>
  );
};
