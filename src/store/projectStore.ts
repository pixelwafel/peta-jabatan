import { create } from 'zustand';
import { produceWithPatches, enablePatches, applyPatches, Patch } from 'immer';
import { Project, ProjectMeta, CustomAttribute } from '@/models/project';
import { OrgNode, NodeType, Rumpun, Rincian } from '@/models/node';
import { uuid } from '@/utils/uuid';
import { canSetParent } from '@/selectors/guards';
import { hierarchyEdges } from '@/utils/edges';
import { childrenOf, subtreeOf, designatedRoot } from '@/selectors/navigation';
import { compareNomor, formatNomor } from '@/utils/numbering';
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

  // Layout & Position
  moveNodes: (
    moves: Array<{ id: string; position: { x: number; y: number } }>,
    txId: string
  ) => void;
  applyLayout: (positions: Map<string, { x: number; y: number }>) => void;

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
    get().commit('Ubah tipe node', draft => {
      const node = draft.nodes.find(n => n.id === id);
      if (node) {
        node.type = type;
        if (type === 'unit') {
          node.rincian = []; // Invariant 1
          node.kategoriId = undefined;
          node.rumpun = [];
        } else if (node.rincian.length === 0) {
          node.rincian = [{ id: uuid(), jenjangId: null, kebutuhan: 0, eksisting: 0 }];
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

  addRincian: (nodeId, jenjangId) => {
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
    get().commit('Hapus rincian', draft => {
      const node = draft.nodes.find(n => n.id === nodeId);
      if (node) {
        node.rincian = node.rincian.filter(r => r.id !== rincianId);
      }
    });
  },

  setRumpun: (nodeId, rumpun) => {
    get().commit('Ubah rumpun', draft => {
      const node = draft.nodes.find(n => n.id === nodeId);
      if (node) {
        node.rumpun = rumpun;
      }
    });
  },

  setKategori: (nodeId, kategoriId) => {
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

  applyLayout: positions => {
    get().commit('Rapikan layout', draft => {
      for (const n of draft.nodes) {
        const pos = positions.get(n.id);
        if (pos) {
          n.position = { ...pos };
        }
      }
    });
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
        // Sort by canvas position (left to right), then name
        const posDiff = a.position.x - b.position.x;
        if (posDiff !== 0) return posDiff;
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
