import { create } from 'zustand';
import { produceWithPatches, enablePatches, applyPatches, Patch } from 'immer';
import { Project, ProjectMeta, CustomAttribute } from '@/models/project';
import { OrgNode, NodeType, Rumpun, Rincian, KepalaUnit } from '@/models/node';
import { uuid } from '@/utils/uuid';
import { canSetParent, isLocked, isSubtreeLocked } from '@/selectors/guards';
import { hierarchyEdges } from '@/utils/edges';
import {
  childrenOf,
  subtreeOf,
  descendantsOf,
  designatedRoot,
  rootNodes,
  parentOf,
} from '@/selectors/navigation';
import { formatNomor } from '@/utils/numbering';
import { useHistoryStore } from './historyStore';
import { useUiStore } from './uiStore';

enablePatches();

export interface ProjectState {
  project: Project | null;

  // Store Management
  setProject: (project: Project | null) => void;
  commit: (
    label: string,
    recipe: (draft: Project) => void,
    opts?: { txId?: string; transient?: boolean }
  ) => void;
  undo: () => boolean;
  redo: () => boolean;

  // Node actions
  addNode: (input: {
    type: NodeType;
    nama?: string;
    parentId?: string;
    position?: { x: number; y: number };
  }) => string;
  updateNode: (id: string, patch: Partial<OrgNode>, txId?: string) => void;
  deleteNode: (id: string, mode: 'node-only' | 'subtree') => void;
  duplicateNode: (id: string, mode: 'node-only' | 'subtree') => string;
  setNodeType: (id: string, type: NodeType) => void;

  // Hierarchy actions
  setParent: (childId: string, parentId: string | null) => void;
  moveNode: (nodeId: string, targetParentId: string | null, targetIndex: number) => void;

  // Detail row actions
  addRincian: (nodeId: string, jenjangId: string | null) => void;
  updateRincian: (
    nodeId: string,
    rincianId: string,
    patch: Partial<Rincian>,
    txId?: string
  ) => void;
  removeRincian: (nodeId: string, rincianId: string) => void;
  setRumpun: (nodeId: string, rumpun: Rumpun[]) => void;
  setKategori: (nodeId: string, kategoriId: string) => void;

  // Kepala unit (posisi struktural, melekat di node Unit — bukan node terpisah)
  setKepalaUnit: (nodeId: string, patch: Partial<KepalaUnit> | null) => void;

  // Kunci node — mencegah edit/hapus/pindah tidak sengaja. Bersifat individual
  // per node (lihat selectors/guards.ts). `cascade: true` adalah shortcut untuk
  // menerapkan status kunci yang sama ke seluruh descendant sekaligus (mis.
  // "kunci semua" pada level OPD/Unit) — tiap node tetap bisa dibuka/dikunci
  // satu-satu sesudahnya karena tidak ada pewarisan.
  setLocked: (nodeId: string, locked: boolean, opts?: { cascade?: boolean }) => void;

  // Layout & Position
  moveNodes: (
    moves: Array<{ id: string; position: { x: number; y: number } }>,
    txId: string
  ) => void;

  // Metadata & Custom Attributes
  setMeta: (patch: Partial<ProjectMeta>) => void;
  addCustomAttribute: (attr: CustomAttribute) => void;
  removeCustomAttribute: (attrId: string) => void;

  // Numbering
  renumberFromStructure: () => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  project: null,

  setProject: (project: Project | null) => {
    set({ project });
    useHistoryStore.getState().clearHistory();
    // Seleksi node lama tidak relevan lagi untuk proyek baru — kalau tidak
    // dibersihkan, panel properti (kolom 3) tetap menampilkan form node dari
    // proyek sebelumnya (atau kosong) alih-alih form metadata OPD.
    useUiStore.getState().clearSelection();
  },

  commit: (label, recipe, opts) => {
    const current = get().project;
    if (!current) return;

    const [next, forward, inverse] = produceWithPatches(current, draft => {
      recipe(draft);
      draft.updatedAt = new Date().toISOString();
    });

    if (forward.length === 0) return; // No-op guard

    set({ project: next });

    if (opts?.transient) return;

    useHistoryStore.getState().record({
      label,
      forward,
      inverse,
      txId: opts?.txId,
    });
  },

  undo: () => {
    const current = get().project;
    if (!current) return false;

    return useHistoryStore.getState().undo((inversePatches: Patch[]) => {
      const restored = applyPatches(get().project!, inversePatches);
      set({ project: restored });
    });
  },

  redo: () => {
    const current = get().project;
    if (!current) return false;

    return useHistoryStore.getState().redo((forwardPatches: Patch[]) => {
      const restored = applyPatches(get().project!, forwardPatches);
      set({ project: restored });
    });
  },

  addNode: ({ type, nama, parentId, position }) => {
    const id = uuid();
    const currentProject = get().project;

    if (currentProject && parentId && isLocked(currentProject.nodes, currentProject.edges, parentId)) {
      return ''; // Unit induk terkunci — tidak bisa menambah anak
    }

    // Helper to calculate position below parent
    let pos = position;
    if (!pos && currentProject) {
      if (parentId) {
        const parentNode = currentProject.nodes.find(n => n.id === parentId);
        if (parentNode) {
          pos = { x: parentNode.position.x + 30, y: parentNode.position.y + 120 };
        }
      }
      if (!pos) pos = { x: 100, y: 100 };
    }

    const siblingCount = currentProject
      ? parentId
        ? childrenOf(currentProject.nodes, currentProject.edges, parentId).length
        : rootNodes(currentProject.nodes, currentProject.edges).length
      : 0;

    get().commit('Tambah node', draft => {
      draft.nodes.push({
        id,
        type,
        nama: nama ?? (type === 'unit' ? 'Unit Baru' : 'Jabatan Baru'),
        nomor: '', // Assigned by renumber, not guessed
        rumpun: [],
        // INVARIANT 1 & 2: units get no rows, positions get exactly one
        rincian:
          type === 'unit'
            ? []
            : [{ id: uuid(), jenjangId: null, kebutuhan: 0, eksisting: 0 }],
        custom: {},
        position: pos ?? { x: 100, y: 100 },
        collapsed: false,
        order: siblingCount,
        // Unit baru otomatis dapat kepala (struktural), kebutuhan 1 — nama
        // dibiarkan kosong supaya default "Kepala {nama unit}" ikut update
        // kalau unitnya di-rename. Bisa diedit/dihapus lewat panel properti.
        ...(type === 'unit'
          ? { kepalaUnit: { jenjangId: null, kebutuhan: 1, eksisting: 0 } }
          : {}),
      });

      if (parentId) {
        draft.edges.push({
          id: uuid(),
          source: parentId,
          target: id,
          kind: 'hirarki',
        });
      }
    });

    useUiStore.getState().selectNodes([id]);
    return id;
  },

  updateNode: (id, patch, txId) => {
    const current = get().project;
    const patchKeys = Object.keys(patch);
    const onlyCollapsed = patchKeys.length === 1 && patchKeys[0] === 'collapsed';
    if (!onlyCollapsed && current && isLocked(current.nodes, current.edges, id)) {
      return; // Node terkunci — hanya expand/collapse (state UI) yang tetap diizinkan
    }

    get().commit(
      'Ubah node',
      draft => {
        const node = draft.nodes.find(n => n.id === id);
        if (node) {
          // If updating rincian via updateNode, enforce invariant 1
          if (patch.rincian && node.type === 'unit') {
            patch.rincian = [];
          }
          Object.assign(node, patch);
        }
      },
      { txId }
    );
  },

  deleteNode: (id, mode) => {
    const current = get().project;
    if (!current) return;

    if (
      mode === 'node-only'
        ? isLocked(current.nodes, current.edges, id)
        : isSubtreeLocked(current.nodes, current.edges, id)
    ) {
      return; // Node (atau ada keturunan) terkunci
    }

    if (mode === 'node-only') {
      // Direct children reattached to deleted node's parent (if any)
      const parentEdge = hierarchyEdges(current.edges).find(e => e.target === id);
      const parentId = parentEdge?.source ?? null;

      get().commit('Hapus node', draft => {
        // Reattach direct children
        const childEdges = hierarchyEdges(draft.edges).filter(e => e.source === id);
        for (const ce of childEdges) {
          if (parentId) {
            draft.edges.push({
              id: uuid(),
              source: parentId,
              target: ce.target,
              kind: 'hirarki',
            });
          }
        }

        // Remove all edges referencing deleted node
        draft.edges = draft.edges.filter(e => e.source !== id && e.target !== id);

        // Remove node
        draft.nodes = draft.nodes.filter(n => n.id !== id);
      });
    } else {
      // Subtree delete
      const subNodes = subtreeOf(current.nodes, current.edges, id);
      const subNodeIds = new Set(subNodes.map(n => n.id));

      get().commit('Hapus subtree', draft => {
        draft.edges = draft.edges.filter(
          e => !subNodeIds.has(e.source) && !subNodeIds.has(e.target)
        );
        draft.nodes = draft.nodes.filter(n => !subNodeIds.has(n.id));
      });
    }

    useUiStore.getState().clearSelection();
  },

  duplicateNode: (id, mode) => {
    const current = get().project;
    if (!current) return '';

    if (mode === 'node-only') {
      const original = current.nodes.find(n => n.id === id);
      if (!original) return '';
      const newId = uuid();

      get().commit('Duplikat node', draft => {
        draft.nodes.push({
          ...structuredClone(original),
          id: newId,
          nomor: '',
          rincian: original.rincian.map(r => ({ ...r, id: uuid() })),
          position: { x: original.position.x + 40, y: original.position.y + 40 },
        });
      });

      useUiStore.getState().selectNodes([newId]);
      return newId;
    } else {
      // Subtree duplicate
      const originals = subtreeOf(current.nodes, current.edges, id);
      if (originals.length === 0) return '';
      const idMap = new Map(originals.map(n => [n.id, uuid()]));
      const newRootId = idMap.get(id)!;

      get().commit('Duplikat subtree', draft => {
        for (const n of originals) {
          draft.nodes.push({
            ...structuredClone(n),
            id: idMap.get(n.id)!,
            nomor: '',
            rincian: n.rincian.map(r => ({ ...r, id: uuid() })),
            position: { x: n.position.x + 40, y: n.position.y + 40 },
          });
        }

        // Internal edges remapped; edge from original parent is NOT copied
        for (const e of hierarchyEdges(current.edges)) {
          if (idMap.has(e.source) && idMap.has(e.target)) {
            draft.edges.push({
              id: uuid(),
              source: idMap.get(e.source)!,
              target: idMap.get(e.target)!,
              kind: 'hirarki',
            });
          }
        }
      });

      useUiStore.getState().selectNodes([newRootId]);
      return newRootId;
    }
  },

  setNodeType: (id, type) => {
    const current = get().project;
    if (current && isLocked(current.nodes, current.edges, id)) return;

    get().commit('Ubah tipe node', draft => {
      const node = draft.nodes.find(n => n.id === id);
      if (node) {
        node.type = type;
        if (type === 'unit') {
          node.rincian = []; // Invariant 1
          node.kategoriId = undefined;
          node.rumpun = [];
          if (!node.kepalaUnit) {
            node.kepalaUnit = { jenjangId: null, kebutuhan: 1, eksisting: 0 };
          }
        } else {
          delete node.kepalaUnit; // hanya melekat pada Unit
          if (node.rincian.length === 0) {
            node.rincian = [{ id: uuid(), jenjangId: null, kebutuhan: 0, eksisting: 0 }];
          }
        }
      }
    });
  },

  setParent: (childId, parentId) => {
    const current = get().project;
    if (!current) return;

    if (parentId && !canSetParent(current.nodes, current.edges, childId, parentId)) {
      return; // Cycle guard
    }

    const oldParentId = parentOf(current.nodes, current.edges, childId)?.id ?? null;
    if (
      isLocked(current.nodes, current.edges, childId) ||
      (oldParentId && isLocked(current.nodes, current.edges, oldParentId)) ||
      (parentId && isLocked(current.nodes, current.edges, parentId))
    ) {
      return; // Node atau salah satu unit induk (lama/baru) terkunci
    }

    get().commit('Ubah parent', draft => {
      // Invariant 5: remove existing hierarchy edge targeting childId
      draft.edges = draft.edges.filter(
        e => !(e.kind === 'hirarki' && e.target === childId)
      );

      if (parentId) {
        draft.edges.push({
          id: uuid(),
          source: parentId,
          target: childId,
          kind: 'hirarki',
        });
      }
    });
  },

  moveNode: (nodeId, targetParentId, targetIndex) => {
    const current = get().project;
    if (!current) return;

    if (targetParentId && !canSetParent(current.nodes, current.edges, nodeId, targetParentId)) {
      return; // Cycle guard, sama seperti setParent()
    }

    const oldParentId = parentOf(current.nodes, current.edges, nodeId)?.id ?? null;

    if (
      isLocked(current.nodes, current.edges, nodeId) ||
      (oldParentId && isLocked(current.nodes, current.edges, oldParentId)) ||
      (targetParentId && isLocked(current.nodes, current.edges, targetParentId))
    ) {
      return; // Node atau salah satu unit induk (lama/baru) terkunci
    }

    const siblingsOf = (parentId: string | null) =>
      (parentId
        ? childrenOf(current.nodes, current.edges, parentId)
        : rootNodes(current.nodes, current.edges)
      )
        .filter(n => n.id !== nodeId)
        .map(n => n.id);

    get().commit('Pindahkan node', draft => {
      // 1. hapus hierarchy edge lama (identik dgn setParent)
      draft.edges = draft.edges.filter(e => !(e.kind === 'hirarki' && e.target === nodeId));
      if (targetParentId) {
        draft.edges.push({ id: uuid(), source: targetParentId, target: nodeId, kind: 'hirarki' });
      }

      // 2. re-index `order` pada sibling BARU (sisipkan di targetIndex)
      const newSiblingIds = siblingsOf(targetParentId);
      newSiblingIds.splice(targetIndex, 0, nodeId);
      newSiblingIds.forEach((id, i) => {
        const n = draft.nodes.find(n => n.id === id);
        if (n) n.order = i;
      });

      // 3. re-index `order` pada sibling LAMA (tutup celah bekas posisi nodeId),
      //    hanya jika pindah ke parent berbeda (kalau sama, langkah 2 sudah cukup)
      if (oldParentId !== targetParentId) {
        const oldSiblingIds = siblingsOf(oldParentId);
        oldSiblingIds.forEach((id, i) => {
          const n = draft.nodes.find(n => n.id === id);
          if (n) n.order = i;
        });
      }
    });
  },

  addRincian: (nodeId, jenjangId) => {
    const current = get().project;
    if (current && isLocked(current.nodes, current.edges, nodeId)) return;

    get().commit('Tambah rincian', draft => {
      const node = draft.nodes.find(n => n.id === nodeId);
      if (node && node.type === 'jabatan') {
        node.rincian.push({
          id: uuid(),
          jenjangId,
          kebutuhan: 0,
          eksisting: 0,
        });
      }
    });
  },

  updateRincian: (nodeId, rincianId, patch, txId) => {
    const current = get().project;
    if (current && isLocked(current.nodes, current.edges, nodeId)) return;

    get().commit(
      'Ubah rincian',
      draft => {
        const node = draft.nodes.find(n => n.id === nodeId);
        if (node) {
          const row = node.rincian.find(r => r.id === rincianId);
          if (row) {
            Object.assign(row, patch);
          }
        }
      },
      { txId }
    );
  },

  removeRincian: (nodeId, rincianId) => {
    const current = get().project;
    if (current && isLocked(current.nodes, current.edges, nodeId)) return;

    get().commit('Hapus rincian', draft => {
      const node = draft.nodes.find(n => n.id === nodeId);
      if (node) {
        node.rincian = node.rincian.filter(r => r.id !== rincianId);
      }
    });
  },

  setRumpun: (nodeId, rumpun) => {
    const current = get().project;
    if (current && isLocked(current.nodes, current.edges, nodeId)) return;

    get().commit('Ubah rumpun', draft => {
      const node = draft.nodes.find(n => n.id === nodeId);
      if (node) {
        node.rumpun = rumpun;
      }
    });
  },

  setKategori: (nodeId, kategoriId) => {
    const current = get().project;
    if (current && isLocked(current.nodes, current.edges, nodeId)) return;

    get().commit('Ubah kategori', draft => {
      const node = draft.nodes.find(n => n.id === nodeId);
      if (node) {
        node.kategoriId = kategoriId;
        // Keep rows & figures, set jenjangId to null (doc 02 §5)
        for (const r of node.rincian) {
          r.jenjangId = null;
        }
      }
    });
  },

  setKepalaUnit: (nodeId, patch) => {
    const current = get().project;
    if (current && isLocked(current.nodes, current.edges, nodeId)) return;

    get().commit('Ubah kepala unit', draft => {
      const node = draft.nodes.find(n => n.id === nodeId);
      if (!node || node.type !== 'unit') return;

      if (patch === null) {
        delete node.kepalaUnit;
        return;
      }

      node.kepalaUnit = {
        jenjangId: node.kepalaUnit?.jenjangId ?? null,
        kebutuhan: node.kepalaUnit?.kebutuhan ?? 0,
        eksisting: node.kepalaUnit?.eksisting ?? 0,
        nama: node.kepalaUnit?.nama,
        kode: node.kepalaUnit?.kode,
        ...patch,
      };
    });
  },

  setLocked: (nodeId, locked, opts) => {
    const current = get().project;
    const ids = new Set([nodeId]);
    if (opts?.cascade && current) {
      for (const d of descendantsOf(current.nodes, current.edges, nodeId)) {
        ids.add(d.id);
      }
    }

    get().commit(locked ? 'Kunci node' : 'Buka kunci node', draft => {
      for (const n of draft.nodes) {
        if (ids.has(n.id)) {
          n.locked = locked;
        }
      }
    });
  },

  moveNodes: (moves, txId) => {
    get().commit(
      'Pindahkan node',
      draft => {
        const map = new Map(moves.map(m => [m.id, m.position]));
        for (const n of draft.nodes) {
          const newPos = map.get(n.id);
          if (newPos) {
            n.position = { ...newPos };
          }
        }
      },
      { txId }
    );
  },

  setMeta: patch => {
    get().commit('Ubah metadata proyek', draft => {
      Object.assign(draft.meta, patch);
    });
  },

  addCustomAttribute: attr => {
    get().commit('Tambah atribut khusus', draft => {
      draft.attributeSchema.push(attr);
    });
  },

  removeCustomAttribute: attrId => {
    get().commit('Hapus atribut khusus', draft => {
      draft.attributeSchema = draft.attributeSchema.filter(a => a.id !== attrId);
      // Strip values from all nodes
      for (const n of draft.nodes) {
        if (n.custom) {
          delete n.custom[attrId];
        }
      }
    });
  },

  renumberFromStructure: () => {
    const current = get().project;
    if (!current) return;

    const root = designatedRoot(current.nodes, current.edges);
    if (!root) return;

    const assignments = new Map<string, string>();

    const walk = (nodeId: string, prefix: number[]) => {
      assignments.set(nodeId, formatNomor(prefix));
      const kids = childrenOf(current.nodes, current.edges, nodeId).sort((a, b) => {
        if (typeof a.order === 'number' && typeof b.order === 'number') {
          const byOrder = a.order - b.order;
          if (byOrder !== 0) return byOrder;
        }
        return a.nama.localeCompare(b.nama);
      });
      kids.forEach((k, i) => walk(k.id, [...prefix, i + 1]));
    };

    walk(root.id, [1]);

    get().commit('Penomoran ulang', draft => {
      for (const n of draft.nodes) {
        const nextNomor = assignments.get(n.id);
        if (nextNomor) {
          n.nomor = nextNomor;
        }
      }
    });
  },
}));
