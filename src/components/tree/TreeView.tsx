import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useProjectStore } from '@/store/projectStore';
import { useUiStore } from '@/store/uiStore';
import { buildTree } from '@/selectors/tree';
import { TreeNode } from '@/models/derived';
import { OrgNode, NodeType } from '@/models/node';
import { ancestorsOf, childrenOf, parentOf, rootNodes } from '@/selectors/navigation';
import { isLocked } from '@/selectors/guards';
import { hierarchyEdges } from '@/utils/edges';
import { NODE_W, nodeHeight } from '@/utils/layout';
import { useReactFlow } from '@xyflow/react';
import { useStructureShortcuts } from '@/hooks/useStructureShortcuts';
import { useDeleteNodeRequest } from '@/hooks/useDeleteNodeRequest';
import { useLiveLayout } from '@/hooks/useLiveLayout';
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FileText,
  Plus,
  CornerDownRight,
  Copy,
  Trash2,
  UserCog,
  Lock,
  Unlock,
  Layers,
} from 'lucide-react';

type DropPosition = 'before' | 'after' | 'inside';
type AddKind = 'child' | 'sibling';

interface DropIndicator {
  id: string;
  position: DropPosition;
}

interface AddMenuState {
  nodeId: string;
  kind: AddKind;
  x: number;
  y: number;
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
  lockedMap: Map<string, boolean>;
  parentLockedMap: Map<string, boolean>;
  selectedIds: string[];
  editingId: string | null;
  dropIndicator: DropIndicator | null;
  onFocus: (id: string) => void;
  onToggleCollapse: (id: string) => void;
  onStartRename: (id: string) => void;
  onCommitRename: (id: string, nama: string) => void;
  onCancelRename: () => void;
  addMenu: AddMenuState | null;
  onToggleAddMenu: (nodeId: string, kind: AddKind, anchor: HTMLElement) => void;
  onConfirmAdd: (nodeId: string, kind: AddKind, type: NodeType) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleLock: (id: string, nextLocked: boolean, cascade?: boolean) => void;
  onDragStartRow: (id: string) => void;
  onDragOverRow: (id: string, position: DropPosition) => void;
  onDragEndRow: () => void;
  onDropRow: (id: string, position: DropPosition) => void;
}

interface AddTypeMenuProps {
  x: number;
  y: number;
  onPick: (type: NodeType) => void;
}

// Portal ke document.body dengan position:fixed — supaya tidak ter-clip oleh
// container outline (overflow-y-auto secara implisit meng-clip sumbu X juga,
// dan panel Properti di kolom sebelah bisa menutupi menu absolute biasa).
const AddTypeMenu: React.FC<AddTypeMenuProps> = ({ x, y, onPick }) =>
  createPortal(
    <div
      onClick={e => e.stopPropagation()}
      style={{ position: 'fixed', top: y, left: x }}
      className="z-[999] bg-slate-800 border border-slate-700 rounded shadow-lg overflow-hidden whitespace-nowrap"
    >
      <button
        onClick={e => {
          e.stopPropagation();
          onPick('unit');
        }}
        className="w-full flex items-center space-x-2 px-3 py-1.5 hover:bg-slate-700 text-slate-200 text-left text-xs"
      >
        <Folder className="w-3.5 h-3.5 text-blue-400" />
        <span>Unit Organisasi</span>
      </button>
      <button
        onClick={e => {
          e.stopPropagation();
          onPick('jabatan');
        }}
        className="w-full flex items-center space-x-2 px-3 py-1.5 hover:bg-slate-700 text-slate-200 text-left text-xs"
      >
        <FileText className="w-3.5 h-3.5 text-slate-400" />
        <span>Jabatan</span>
      </button>
    </div>,
    document.body
  );

const TreeRow: React.FC<TreeRowProps> = ({
  treeNode,
  nodeByIdMap,
  lockedMap,
  parentLockedMap,
  selectedIds,
  editingId,
  dropIndicator,
  onFocus,
  onToggleCollapse,
  onStartRename,
  onCommitRename,
  onCancelRename,
  addMenu,
  onToggleAddMenu,
  onConfirmAdd,
  onDuplicate,
  onDelete,
  onToggleLock,
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
  // Kunci individual per node — tidak ada lagi "terkunci otomatis" dari
  // leluhur, jadi locked === ownLocked (lockedMap disamakan langsung).
  const locked = lockedMap.get(node.id) ?? false;
  const ownLocked = locked;
  // parentLocked = parent langsung terkunci — dipakai untuk proteksi struktural
  // (tidak bisa restrukturisasi anak dari Unit yang terkunci), bukan pewarisan.
  const parentLocked = parentLockedMap.get(node.id) ?? false;

  // Calculate figures summary
  const keb = node.rincian.reduce((acc, r) => acc + r.kebutuhan, 0);
  const eks = node.rincian.reduce((acc, r) => acc + r.eksisting, 0);

  return (
    <div className="space-y-0.5 select-none font-mono">
      <div
        draggable={!isEditing && !locked && !parentLocked}
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
        className={`group relative flex items-center justify-between py-1.5 px-1.5 rounded cursor-pointer transition-colors text-sm ${
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

        <div className="flex items-center space-x-1.5 min-w-0 flex-1 pr-2">
          {hasChildren ? (
            <button
              onClick={e => {
                e.stopPropagation();
                onToggleCollapse(node.id);
              }}
              className="p-0.5 hover:bg-slate-700 rounded text-slate-400"
            >
              {node.collapsed ? (
                <ChevronRight className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          ) : (
            <span className="w-4 inline-block" />
          )}

          {isUnit ? (
            <Folder className="w-4 h-4 text-blue-400 flex-shrink-0" />
          ) : (
            <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
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
              className="bg-slate-900 border border-blue-500 rounded px-1 py-0.5 text-sm text-slate-100 w-full min-w-0"
            />
          ) : (
            <span
              className="truncate min-w-0 shrink"
              onDoubleClick={e => {
                e.stopPropagation();
                if (locked) return;
                onStartRename(node.id);
              }}
            >
              {node.nama}
            </span>
          )}

          {/* Row action buttons — tepat di sebelah nama, muncul saat hover */}
          {!isEditing && (
            <div className="hidden group-hover:flex items-center space-x-0.5 flex-shrink-0">
              <button
                title={ownLocked ? 'Buka kunci node ini' : 'Kunci node ini'}
                onClick={e => {
                  e.stopPropagation();
                  onToggleLock(node.id, !ownLocked);
                }}
                className={`p-0.5 hover:bg-slate-700 rounded ${
                  ownLocked ? 'text-amber-400' : 'text-slate-400'
                }`}
              >
                {locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
              </button>
              {hasChildren && (
                <button
                  title={
                    ownLocked
                      ? 'Buka kunci node ini beserta seluruh turunannya'
                      : 'Kunci node ini beserta seluruh turunannya'
                  }
                  onClick={e => {
                    e.stopPropagation();
                    onToggleLock(node.id, !ownLocked, true);
                  }}
                  className="p-0.5 hover:bg-slate-700 rounded text-slate-400"
                >
                  <Layers className="w-3 h-3" />
                </button>
              )}
              <button
                title={locked ? 'Node terkunci' : 'Tambah anak'}
                disabled={locked}
                onClick={e => {
                  e.stopPropagation();
                  onToggleAddMenu(node.id, 'child', e.currentTarget);
                }}
                className="p-0.5 hover:bg-slate-700 rounded text-slate-400 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed"
              >
                <Plus className="w-3 h-3" />
              </button>
              <button
                title={parentLocked ? 'Unit induk terkunci' : 'Tambah sibling'}
                disabled={parentLocked}
                onClick={e => {
                  e.stopPropagation();
                  onToggleAddMenu(node.id, 'sibling', e.currentTarget);
                }}
                className="p-0.5 hover:bg-slate-700 rounded text-slate-400 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed"
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
                title={locked ? 'Node terkunci' : 'Hapus'}
                disabled={locked}
                onClick={e => {
                  e.stopPropagation();
                  onDelete(node.id);
                }}
                className="p-0.5 hover:bg-slate-700 rounded text-red-400 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          )}

          {addMenu?.nodeId === node.id && (
            <AddTypeMenu
              x={addMenu.x}
              y={addMenu.y}
              onPick={type => onConfirmAdd(node.id, addMenu.kind, type)}
            />
          )}
        </div>

        <div className="flex items-center space-x-1 flex-shrink-0">
          {/* Lock indicator — selalu terlihat, tidak cuma saat hover */}
          {locked && (
            <span title="Terkunci">
              <Lock className="w-3 h-3 flex-shrink-0 text-amber-400" />
            </span>
          )}

          {/* Figures Badge */}
          {!isUnit && node.rincian.length > 0 && (
            <span className="text-[11px] text-slate-400 bg-slate-950/60 px-1.5 py-0.5 rounded">
              {keb}/{eks}
            </span>
          )}

          {/* Kepala unit (struktural) badge */}
          {isUnit && node.kepalaUnit && (
            <span
              className="flex items-center space-x-1 text-[11px] text-slate-400 bg-slate-950/60 px-1.5 py-0.5 rounded"
              title={node.kepalaUnit.nama || `Kepala ${node.nama}`}
            >
              <UserCog className="w-3 h-3 text-blue-400" />
              <span>
                {node.kepalaUnit.kebutuhan}/{node.kepalaUnit.eksisting}
              </span>
            </span>
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
            lockedMap={lockedMap}
            parentLockedMap={parentLockedMap}
            selectedIds={selectedIds}
            editingId={editingId}
            dropIndicator={dropIndicator}
            onFocus={onFocus}
            onToggleCollapse={onToggleCollapse}
            onStartRename={onStartRename}
            onCommitRename={onCommitRename}
            onCancelRename={onCancelRename}
            addMenu={addMenu}
            onToggleAddMenu={onToggleAddMenu}
            onConfirmAdd={onConfirmAdd}
            onDuplicate={onDuplicate}
            onDelete={onDelete}
            onToggleLock={onToggleLock}
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
  const requestDelete = useDeleteNodeRequest();
  const moveNode = useProjectStore(s => s.moveNode);
  const setLocked = useProjectStore(s => s.setLocked);
  const selectedNodeIds = useUiStore(s => s.selectedNodeIds);
  const selectNodes = useUiStore(s => s.selectNodes);
  const showJenjangOnCard = useUiStore(s => s.showJenjangOnCard);
  const { setCenter } = useReactFlow();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [addMenu, setAddMenu] = useState<AddMenuState | null>(null);

  // Tutup menu pilih tipe saat klik di luar menu (menu sendiri men-stopPropagation)
  // atau saat area di belakangnya di-scroll (menu pakai position:fixed, tidak ikut scroll)
  useEffect(() => {
    if (!addMenu) return;
    const close = () => setAddMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [addMenu]);

  const nodes = project?.nodes ?? [];
  const edges = project?.edges ?? [];

  const tree = useMemo(() => buildTree(nodes, edges), [nodes, edges]);
  const nodeByIdMap = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);

  // Dihitung sekali di sini (bukan per-baris) supaya efisien.
  const lockedMap = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const n of nodes) {
      map.set(n.id, isLocked(nodes, edges, n.id));
    }
    return map;
  }, [nodes, edges]);

  const parentLockedMap = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const e of hierarchyEdges(edges)) {
      map.set(e.target, lockedMap.get(e.source) ?? false);
    }
    return map;
  }, [edges, lockedMap]);

  // Posisi mode preview di canvas dihitung otomatis (Dagre) — pakai layout
  // yang sama supaya "fokus ke canvas" akurat terhadap yang benar-benar dirender.
  const liveLayout = useLiveLayout(nodes, edges, {
    direction: 'TB',
    scope: 'all',
    showJenjang: showJenjangOnCard,
  });

  const handleFocus = (nodeId: string) => {
    // Auto expand collapsed ancestors
    const collapsedAncestors = ancestorsOf(nodes, edges, nodeId).filter(a => a.collapsed);
    if (collapsedAncestors.length > 0) {
      for (const a of collapsedAncestors) {
        updateNode(a.id, { collapsed: false });
      }
    }

    const target = nodeByIdMap.get(nodeId);
    const pos = liveLayout.get(nodeId) ?? target?.position;
    if (target && pos) {
      const h = nodeHeight(target, showJenjangOnCard);
      setCenter(pos.x + NODE_W / 2, pos.y + h / 2, {
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

  const handleToggleAddMenu = (nodeId: string, kind: AddKind, anchor: HTMLElement) => {
    setAddMenu(prev => {
      if (prev?.nodeId === nodeId && prev.kind === kind) return null;
      const rect = anchor.getBoundingClientRect();
      return { nodeId, kind, x: rect.left, y: rect.bottom + 4 };
    });
  };

  const handleConfirmAdd = (nodeId: string, kind: AddKind, type: NodeType) => {
    if (kind === 'child') {
      addNode({ type, parentId: nodeId });
    } else {
      const parentId = parentOf(nodes, edges, nodeId)?.id;
      addNode({ type, parentId });
    }
    setAddMenu(null);
  };

  const handleToggleLock = (nodeId: string, nextLocked: boolean, cascade?: boolean) => {
    setLocked(nodeId, nextLocked, { cascade });
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
          lockedMap={lockedMap}
          parentLockedMap={parentLockedMap}
          selectedIds={selectedNodeIds}
          editingId={editingId}
          dropIndicator={dropIndicator}
          onFocus={handleFocus}
          onToggleCollapse={handleToggleCollapse}
          onStartRename={setEditingId}
          onCommitRename={handleCommitRename}
          onCancelRename={() => setEditingId(null)}
          addMenu={addMenu}
          onToggleAddMenu={handleToggleAddMenu}
          onConfirmAdd={handleConfirmAdd}
          onDuplicate={id => duplicateNode(id, 'node-only')}
          onDelete={id => requestDelete(id)}
          onToggleLock={handleToggleLock}
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
