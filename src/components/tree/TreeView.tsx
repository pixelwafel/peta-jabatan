import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useProjectStore } from '@/store/projectStore';
import { useUiStore } from '@/store/uiStore';
import { buildTree, flattenVisibleTree } from '@/selectors/tree';
import { OrgNode, NodeType } from '@/models/node';
import { ancestorsOf, childrenOf, parentOf, rootNodes } from '@/selectors/navigation';
import { isLocked } from '@/selectors/guards';
import { hierarchyEdges } from '@/utils/edges';
import { NODE_W, nodeHeight, computeLayoutCached } from '@/utils/layout';
import { computeVisibleRange } from '@/utils/virtualization';
import { useReactFlow } from '@xyflow/react';
import { useStructureShortcuts } from '@/hooks/useStructureShortcuts';
import { useDeleteNodeRequest } from '@/hooks/useDeleteNodeRequest';
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

// Fase 2.5 — tinggi baris tetap, dipakai virtualisasi (computeVisibleRange).
// Baris aslinya (py-1.5 + text-sm, tanpa gap eksplisit lagi — lihat catatan
// di TreeRow) tingginya ~34px; angka ini sengaja sedikit longgar (36px)
// supaya konten tidak pernah terpotong kalau font rendering OS sedikit beda.
const ROW_HEIGHT = 36;
const OVERSCAN = 8;
const FALLBACK_VIEWPORT_HEIGHT = 480;

interface TreeRowProps {
  id: string;
  depth: number;
  hasChildren: boolean;
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

// Fase 1.5: React.memo — hanya efektif kalau SEMUA prop di bawah (termasuk
// handler) punya identitas stabil antar-render; lihat useCallback di
// TreeView di bawah dan fix di hooks/useDeleteNodeRequest.ts. Tanpa itu,
// shallow-compare bawaan memo gagal tiap keystroke dan tiap baris tetap
// re-render seperti sebelum di-memo.
const TreeRow: React.FC<TreeRowProps> = React.memo(function TreeRow({
  id,
  depth,
  hasChildren,
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
}) {
  const node = nodeByIdMap.get(id);
  if (!node) return null;

  const isSelected = selectedIds.includes(node.id);
  const isUnit = node.type === 'unit';
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
    // Fase 2.5 — tinggi tetap (ROW_HEIGHT) menggantikan `space-y-0.5` +
    // tinggi konten-otomatis: virtualisasi (computeVisibleRange di TreeView)
    // butuh matematika baris seragam. `overflow-hidden` menjaga rounding
    // sub-pixel supaya tidak ada 1px konten row berikutnya yang bocor.
    <div className="select-none font-mono" style={{ height: ROW_HEIGHT, overflow: 'hidden' }}>
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
        style={{ paddingLeft: `${depth * 12 + 6}px` }}
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
    </div>
  );
});

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

  // Fase 2.5 — virtualisasi: TreeView sekarang memiliki scroll container-nya
  // sendiri (dulu dimiliki StructurePanel.tsx, lihat perubahan di sana) supaya
  // bisa membaca scrollTop & tinggi viewport sungguhan lewat ResizeObserver,
  // pola sama seperti InstanceGrid.tsx.
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(FALLBACK_VIEWPORT_HEIGHT);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const height = entries[0]?.contentRect.height;
      if (height) setViewportHeight(height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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

  // Fase 2.5 — array datar top-down yang sudah melompati subtree collapsed
  // (selectors/tree.ts flattenVisibleTree), dasar virtualisasi di bawah.
  const flatRows = useMemo(() => flattenVisibleTree(tree, nodeByIdMap), [tree, nodeByIdMap]);
  const { startIndex, endIndex } = computeVisibleRange(
    scrollTop,
    ROW_HEIGHT,
    viewportHeight,
    OVERSCAN,
    flatRows.length
  );
  const visibleRows = flatRows.slice(startIndex, endIndex);

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

  // Fase 1.6: TIDAK lagi useLiveLayout() di sini — liveLayout di tab Outline
  // dulu HANYA dipakai handleFocus (klik baris -> center kanvas), tapi karena
  // ia hook di top-level, Dagre lengkap jalan ulang tiap keystroke walau tab
  // Preview tidak sedang aktif/mounted. computeLayoutCached() dipanggil
  // langsung di dalam handler saat klik — 30-100ms saat itu wajar, dan kalau
  // geometri tak berubah sejak Canvas terakhir render (cache dibagi lewat
  // utils/layout.ts), panggilan ini malah gratis (cache hit).

  // Fase 1.5: semua handler di bawah dibungkus useCallback dengan dependency
  // MINIMAL (action ref Zustand yang stabil + state UI lokal), BUKAN `nodes`/
  // `edges` — keduanya berganti referensi tiap commit (tiap keystroke), yang
  // kalau masuk dependency array akan membuat handler-nya sendiri berganti
  // identitas tiap keystroke, membatalkan React.memo(TreeRow) di atas untuk
  // SEMUA baris. Baca nodes/edges terkini via getState() di dalam handler,
  // bukan dari closure reaktif.
  const handleFocus = useCallback(
    (nodeId: string) => {
      const proj = useProjectStore.getState().project;
      const liveNodes = proj?.nodes ?? [];
      const liveEdges = proj?.edges ?? [];

      // Auto expand collapsed ancestors
      const collapsedAncestors = ancestorsOf(liveNodes, liveEdges, nodeId).filter(a => a.collapsed);
      if (collapsedAncestors.length > 0) {
        for (const a of collapsedAncestors) {
          updateNode(a.id, { collapsed: false });
        }
      }

      const target = liveNodes.find(n => n.id === nodeId);
      if (!target) return;
      const layout = computeLayoutCached(liveNodes, liveEdges, {
        direction: 'TB',
        scope: 'all',
        showJenjang: showJenjangOnCard,
      });
      const pos = layout.get(nodeId) ?? target.position;
      const h = nodeHeight(target, showJenjangOnCard);
      setCenter(pos.x + NODE_W / 2, pos.y + h / 2, {
        zoom: 1.2,
        duration: 300,
      });
      selectNodes([nodeId]);
    },
    [updateNode, showJenjangOnCard, setCenter, selectNodes]
  );

  const handleToggleCollapse = useCallback(
    (nodeId: string) => {
      const node = useProjectStore.getState().project?.nodes.find(n => n.id === nodeId);
      if (node) {
        updateNode(nodeId, { collapsed: !node.collapsed });
      }
    },
    [updateNode]
  );

  const handleCommitRename = useCallback(
    (nodeId: string, nama: string) => {
      const trimmed = nama.trim();
      if (trimmed) {
        updateNode(nodeId, { nama: trimmed });
      }
      setEditingId(null);
    },
    [updateNode]
  );

  const handleCancelRename = useCallback(() => setEditingId(null), []);

  const handleToggleAddMenu = useCallback((nodeId: string, kind: AddKind, anchor: HTMLElement) => {
    setAddMenu(prev => {
      if (prev?.nodeId === nodeId && prev.kind === kind) return null;
      const rect = anchor.getBoundingClientRect();
      return { nodeId, kind, x: rect.left, y: rect.bottom + 4 };
    });
  }, []);

  const handleConfirmAdd = useCallback(
    (nodeId: string, kind: AddKind, type: NodeType) => {
      if (kind === 'child') {
        addNode({ type, parentId: nodeId });
      } else {
        const proj = useProjectStore.getState().project;
        const parentId = proj ? parentOf(proj.nodes, proj.edges, nodeId)?.id : undefined;
        addNode({ type, parentId });
      }
      setAddMenu(null);
    },
    [addNode]
  );

  const handleDuplicateRow = useCallback(
    (id: string) => duplicateNode(id, 'node-only'),
    [duplicateNode]
  );

  const handleDeleteRow = useCallback((id: string) => requestDelete(id), [requestDelete]);

  const handleToggleLock = useCallback(
    (nodeId: string, nextLocked: boolean, cascade?: boolean) => {
      setLocked(nodeId, nextLocked, { cascade });
    },
    [setLocked]
  );

  const handleDragOverRow = useCallback(
    (id: string, position: DropPosition) => setDropIndicator({ id, position }),
    []
  );

  const handleDragEndRow = useCallback(() => {
    setDraggedId(null);
    setDropIndicator(null);
  }, []);

  const handleDrop = useCallback(
    (targetId: string, position: DropPosition) => {
      const dId = draggedId;
      setDraggedId(null);
      setDropIndicator(null);
      if (!dId || dId === targetId) return;

      if (position === 'inside') {
        moveNode(dId, targetId, 0);
        return;
      }

      const proj = useProjectStore.getState().project;
      const liveNodes = proj?.nodes ?? [];
      const liveEdges = proj?.edges ?? [];
      const targetParentId = parentOf(liveNodes, liveEdges, targetId)?.id ?? null;
      const siblings = (
        targetParentId
          ? childrenOf(liveNodes, liveEdges, targetParentId)
          : rootNodes(liveNodes, liveEdges)
      )
        .slice()
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const targetIndex = siblings.findIndex(s => s.id === targetId);
      const insertIndex = position === 'after' ? targetIndex + 1 : targetIndex;
      moveNode(dId, targetParentId, insertIndex);
    },
    [draggedId, moveNode]
  );

  if (nodes.length === 0) {
    return (
      <div className="p-4 text-center text-slate-500 italic text-xs">
        Tidak ada node dalam struktur.
      </div>
    );
  }

  // Fase 2.5 — TreeView memiliki scroll container-nya sendiri (dipindah dari
  // StructurePanel.tsx, lihat perubahan di sana) supaya scrollTop/tinggi
  // viewport bisa dibaca untuk windowing. Baris di luar [startIndex,
  // endIndex) tidak dirender ke DOM sama sekali — spacer atas (tinggi
  // startIndex*ROW_HEIGHT lewat translateY) menjaga tinggi scrollbar tetap
  // benar tanpa perlu me-render placeholder kosong per baris.
  return (
    <div
      ref={scrollRef}
      onScroll={e => setScrollTop(e.currentTarget.scrollTop)}
      className="h-full overflow-y-auto p-3 text-xs"
    >
      <div style={{ height: flatRows.length * ROW_HEIGHT, position: 'relative' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, transform: `translateY(${startIndex * ROW_HEIGHT}px)` }}>
          {visibleRows.map(row => (
            <TreeRow
              key={row.id}
              id={row.id}
              depth={row.depth}
              hasChildren={row.hasChildren}
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
              onCancelRename={handleCancelRename}
              addMenu={addMenu}
              onToggleAddMenu={handleToggleAddMenu}
              onConfirmAdd={handleConfirmAdd}
              onDuplicate={handleDuplicateRow}
              onDelete={handleDeleteRow}
              onToggleLock={handleToggleLock}
              onDragStartRow={setDraggedId}
              onDragOverRow={handleDragOverRow}
              onDragEndRow={handleDragEndRow}
              onDropRow={handleDrop}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
