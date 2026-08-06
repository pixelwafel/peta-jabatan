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
import { useProjectIndexStore } from './projectIndexStore';
import { canCreateLink } from '@/selectors/linkResolver';
import { LinkRef } from '@/models/node';
import { UnitInstance } from '@/models/project';
import { getStructureIndex } from '@/selectors/structureIndex';
import { buildTemplateUnitIds, containingTemplateUnitId } from '@/selectors/templateInstance';

enablePatches();

/**
 * Hapus kolom (`rincianId` atau id unit kepala) dari `figures` seluruh
 * instance milik `templateNodeId` (docs/15-template-instance.md §2
 * "structure edits cascade with confirmation"). Konfirmasi blast-radius-nya
 * sendiri adalah tanggung jawab UI (lihat selectors/templateInstance.ts
 * export terkait) — fungsi ini murni eksekusi setelah dikonfirmasi.
 */
function purgeInstanceColumns(
  draft: Project,
  templateNodeId: string,
  columnKeys: string[]
): void {
  if (!draft.instances || columnKeys.length === 0) return;
  const keys = new Set(columnKeys);
  for (const inst of draft.instances) {
    if (inst.templateNodeId !== templateNodeId) continue;
    for (const key of keys) {
      delete inst.figures[key];
    }
  }
}

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

  // Link nodes (docs/13-link-nodes.md). Link & children/kepalaUnit saling
  // eksklusif — makeLink menolak node yang punya children, dan menghapus
  // kepalaUnit sekaligus supaya tidak dobel-hitung dengan link.cached.
  makeLink: (nodeId: string, ref: Omit<LinkRef, 'cached'>) => { ok: boolean; reason?: 'has-children' | 'cycle' | 'locked' | 'is-template' };
  unlinkNode: (nodeId: string) => void;

  // Template-instance (docs/15-template-instance.md). isTemplate & link saling
  // eksklusif (TEMPLATE_LINK_CONFLICT); tidak boleh nested (TEMPLATE_NESTED).
  makeTemplate: (
    nodeId: string,
    seed: 'seed' | 'zero'
  ) => { ok: boolean; reason?: 'not-unit' | 'is-link' | 'nested' | 'locked' };
  unmakeTemplate: (nodeId: string) => { ok: boolean; reason?: 'multiple-instances' };
  addInstance: (templateNodeId: string, nama: string) => string;
  duplicateInstance: (instanceId: string) => string;
  removeInstance: (instanceId: string) => void;
  updateInstanceFigure: (
    instanceId: string,
    columnKey: string,
    patch: Partial<{ kebutuhan: number; eksisting: number }>,
    txId?: string
  ) => void;

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

    // Template-instance cascade (docs/15-template-instance.md §2 "structure
    // edits cascade"): kalau node yang dihapus ADALAH unit template, seluruh
    // instance-nya ikut lenyap (tidak ada gunanya instance tanpa templatenya).
    // Kalau cuma node BIASA di dalam subtree template, cukup kolom miliknya
    // (rincianId / id unit kepala) yang dibuang dari tiap instance.
    const idxForTemplate = getStructureIndex(current.nodes, current.edges);
    const templateUnitIds = buildTemplateUnitIds(current.nodes);
    const containingId = containingTemplateUnitId(id, idxForTemplate, templateUnitIds);

    if (mode === 'node-only') {
      // Direct children reattached to deleted node's parent (if any)
      const parentEdge = hierarchyEdges(current.edges).find(e => e.target === id);
      const parentId = parentEdge?.source ?? null;
      const removedNode = current.nodes.find(n => n.id === id);

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

        if (containingId === id) {
          draft.instances = (draft.instances ?? []).filter(i => i.templateNodeId !== id);
        } else if (containingId && removedNode) {
          const keys: string[] = [];
          if (removedNode.type === 'unit' && removedNode.kepalaUnit) keys.push(removedNode.id);
          if (removedNode.type === 'jabatan') keys.push(...removedNode.rincian.map(r => r.id));
          purgeInstanceColumns(draft, containingId, keys);
        }
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

        if (containingId === id) {
          draft.instances = (draft.instances ?? []).filter(i => i.templateNodeId !== id);
        } else if (containingId) {
          const keys: string[] = [];
          for (const n of subNodes) {
            if (n.type === 'unit' && n.kepalaUnit) keys.push(n.id);
            if (n.type === 'jabatan') keys.push(...n.rincian.map(r => r.id));
          }
          purgeInstanceColumns(draft, containingId, keys);
        }
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

    // Template-instance cascade (doc 15 §2): baris ini dipakai sebagai kolom
    // di instance kalau posisinya di dalam subtree template — hapus kolomnya
    // sekalian, satu commit/satu undo step dengan penghapusan barisnya.
    const templateId = current
      ? containingTemplateUnitId(
          nodeId,
          getStructureIndex(current.nodes, current.edges),
          buildTemplateUnitIds(current.nodes)
        )
      : null;

    get().commit('Hapus rincian', draft => {
      const node = draft.nodes.find(n => n.id === nodeId);
      if (node) {
        node.rincian = node.rincian.filter(r => r.id !== rincianId);
      }
      if (templateId) {
        purgeInstanceColumns(draft, templateId, [rincianId]);
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

    // Template-instance cascade (doc 15 §2): kolom kepala unit dikunci pakai
    // id unit-nya sendiri (lihat selectors/templateInstance.ts) — hapus
    // kolom itu dari semua instance kalau kepala unit ini dihapus.
    const templateId = current
      ? containingTemplateUnitId(
          nodeId,
          getStructureIndex(current.nodes, current.edges),
          buildTemplateUnitIds(current.nodes)
        )
      : null;

    get().commit('Ubah kepala unit', draft => {
      const node = draft.nodes.find(n => n.id === nodeId);
      if (!node || node.type !== 'unit') return;

      if (patch === null) {
        delete node.kepalaUnit;
        if (templateId) purgeInstanceColumns(draft, templateId, [nodeId]);
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

  makeLink: (nodeId, ref) => {
    const current = get().project;
    if (!current) return { ok: false, reason: 'locked' };

    if (isLocked(current.nodes, current.edges, nodeId)) {
      return { ok: false, reason: 'locked' };
    }

    const node = current.nodes.find(n => n.id === nodeId);
    if (!node || node.type !== 'unit') return { ok: false, reason: 'has-children' };

    if (node.isTemplate) {
      return { ok: false, reason: 'is-template' }; // TEMPLATE_LINK_CONFLICT (doc 15 §1)
    }

    if (childrenOf(current.nodes, current.edges, nodeId).length > 0) {
      return { ok: false, reason: 'has-children' }; // Link & children saling eksklusif (doc 13 §1)
    }

    const index = useProjectIndexStore.getState().index;
    if (index && !canCreateLink(index, current.meta.kodeOPD, ref.kodeOPD)) {
      return { ok: false, reason: 'cycle' }; // Cycle guard (doc 13 §2)
    }

    get().commit('Jadikan tautan', draft => {
      const n = draft.nodes.find(n => n.id === nodeId);
      if (!n) return;
      delete n.kepalaUnit; // link & kepalaUnit saling eksklusif, lihat models/node.ts
      n.link = {
        ...ref,
        cached: { kebutuhan: 0, eksisting: 0, nodeCount: 0, updatedAt: '' },
      };
    });

    return { ok: true };
  },

  unlinkNode: (nodeId) => {
    const current = get().project;
    if (current && isLocked(current.nodes, current.edges, nodeId)) return;

    get().commit('Putuskan tautan', draft => {
      const node = draft.nodes.find(n => n.id === nodeId);
      if (node) {
        delete node.link;
      }
    });
  },

  makeTemplate: (nodeId, seed) => {
    const current = get().project;
    if (!current) return { ok: false, reason: 'locked' };
    if (isLocked(current.nodes, current.edges, nodeId)) return { ok: false, reason: 'locked' };

    const node = current.nodes.find(n => n.id === nodeId);
    if (!node || node.type !== 'unit') return { ok: false, reason: 'not-unit' };
    if (node.link) return { ok: false, reason: 'is-link' }; // TEMPLATE_LINK_CONFLICT

    // TEMPLATE_NESTED guard: node ini belum isTemplate, jadi kalau
    // containingTemplateUnitId menemukan SESUATU, itu pasti leluhur —
    // template tidak boleh ada di dalam subtree template lain (doc 15 §1).
    const idx = getStructureIndex(current.nodes, current.edges);
    const templateUnitIds = buildTemplateUnitIds(current.nodes);
    if (containingTemplateUnitId(nodeId, idx, templateUnitIds)) {
      return { ok: false, reason: 'nested' };
    }

    // Kumpulkan angka existing di seluruh subtree SEBELUM di-nol-kan (doc 15
    // §2 "seed one instance from the existing figures, or zero them").
    const subtreeNodes = subtreeOf(current.nodes, current.edges, nodeId);
    const seedFigures: UnitInstance['figures'] = {};
    for (const n of subtreeNodes) {
      if (n.type === 'unit' && n.kepalaUnit) {
        seedFigures[n.id] = { kebutuhan: n.kepalaUnit.kebutuhan, eksisting: n.kepalaUnit.eksisting };
      } else if (n.type === 'jabatan') {
        for (const r of n.rincian) {
          seedFigures[r.id] = { kebutuhan: r.kebutuhan, eksisting: r.eksisting };
        }
      }
    }
    const newInstanceId = seed === 'seed' ? uuid() : null;

    get().commit('Jadikan template', draft => {
      const dNode = draft.nodes.find(n => n.id === nodeId);
      if (!dNode) return;
      dNode.isTemplate = true;

      // Nol-kan seluruh baris di subtree — angka nyata sekarang di instance
      // (invariant TEMPLATE_ROW_HAS_FIGURES, ditegakkan validator di M12.4).
      for (const n of subtreeOf(draft.nodes, draft.edges, nodeId)) {
        if (n.type === 'unit' && n.kepalaUnit) {
          n.kepalaUnit.kebutuhan = 0;
          n.kepalaUnit.eksisting = 0;
        } else if (n.type === 'jabatan') {
          for (const r of n.rincian) {
            r.kebutuhan = 0;
            r.eksisting = 0;
          }
        }
      }

      if (newInstanceId) {
        if (!draft.instances) draft.instances = [];
        draft.instances.push({
          id: newInstanceId,
          templateNodeId: nodeId,
          nama: dNode.nama,
          figures: seedFigures,
        });
      }
    });

    return { ok: true };
  },

  unmakeTemplate: nodeId => {
    const current = get().project;
    if (!current) return { ok: false };
    if (isLocked(current.nodes, current.edges, nodeId)) return { ok: false };

    // Dengan >1 instance, tolak sampai instance-nya diselesaikan (diekspor
    // atau dihapus) — tepat 1 instance ditawarkan dilipat balik ke baris
    // (doc 15 §2 "Unmarking").
    const relevant = (current.instances ?? []).filter(i => i.templateNodeId === nodeId);
    if (relevant.length > 1) return { ok: false, reason: 'multiple-instances' };
    const foldInstance = relevant[0];

    get().commit('Batalkan template', draft => {
      const dNode = draft.nodes.find(n => n.id === nodeId);
      if (!dNode) return;
      delete dNode.isTemplate;

      if (foldInstance) {
        for (const n of subtreeOf(draft.nodes, draft.edges, nodeId)) {
          if (n.type === 'unit' && n.kepalaUnit) {
            const fig = foldInstance.figures[n.id];
            if (fig) {
              n.kepalaUnit.kebutuhan = fig.kebutuhan;
              n.kepalaUnit.eksisting = fig.eksisting;
            }
          } else if (n.type === 'jabatan') {
            for (const r of n.rincian) {
              const fig = foldInstance.figures[r.id];
              if (fig) {
                r.kebutuhan = fig.kebutuhan;
                r.eksisting = fig.eksisting;
              }
            }
          }
        }
        draft.instances = (draft.instances ?? []).filter(i => i.id !== foldInstance.id);
      }
    });

    return { ok: true };
  },

  addInstance: (templateNodeId, nama) => {
    const id = uuid();
    get().commit('Tambah satuan', draft => {
      if (!draft.instances) draft.instances = [];
      draft.instances.push({ id, templateNodeId, nama, figures: {} });
    });
    return id;
  },

  duplicateInstance: instanceId => {
    const current = get().project;
    const original = current?.instances?.find(i => i.id === instanceId);
    if (!original) return '';

    const newId = uuid();
    const cloned = structuredClone(original); // di luar recipe — `original` bukan Immer draft/proxy
    get().commit('Duplikat satuan', draft => {
      if (!draft.instances) return;
      draft.instances.push({ ...cloned, id: newId, nama: `${cloned.nama} — Salinan` });
    });
    return newId;
  },

  removeInstance: instanceId => {
    get().commit('Hapus satuan', draft => {
      draft.instances = (draft.instances ?? []).filter(i => i.id !== instanceId);
    });
  },

  updateInstanceFigure: (instanceId, columnKey, patch, txId) => {
    get().commit(
      'Ubah angka satuan',
      draft => {
        const inst = draft.instances?.find(i => i.id === instanceId);
        if (!inst) return;
        const prev = inst.figures[columnKey] ?? { kebutuhan: 0, eksisting: 0 };
        inst.figures[columnKey] = { ...prev, ...patch };
      },
      { txId }
    );
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
