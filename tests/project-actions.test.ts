import { describe, it, expect, beforeEach } from 'vitest';
import { useProjectStore } from '../src/store/projectStore';
import { useProjectIndexStore } from '../src/store/projectIndexStore';
import { useHistoryStore } from '../src/store/historyStore';
import { Project } from '../src/models/project';

describe('Project Actions & Business Rules', () => {
  const initialProject: Project = {
    id: 'proj-actions',
    schemaVersion: '1.0.0',
    configVersion: '2026.1',
    meta: { namaOPD: 'Dinas Pendidikan', kodeOPD: 'DISDIK', penyusun: 'Admin' },
    attributeSchema: [
      { id: 'attr-1', nama: 'Formasi 2027', tipe: 'number' },
    ],
    nodes: [
      {
        id: 'root-unit',
        type: 'unit',
        nama: 'Dinas Pendidikan',
        nomor: '1',
        rumpun: [],
        rincian: [],
        custom: { 'attr-1': 10 },
        position: { x: 0, y: 0 },
        collapsed: false,
      },
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    useProjectStore.getState().setProject(structuredClone(initialProject));
  });

  it('addNode enforces invariant 1 & 2 (unit nodes get rincian [], jabatan gets 1 row)', () => {
    const unitId = useProjectStore.getState().addNode({ type: 'unit', nama: 'Sekretariat' });
    const jabatanId = useProjectStore.getState().addNode({ type: 'jabatan', nama: 'Analis' });

    const nodes = useProjectStore.getState().project!.nodes;
    const unitNode = nodes.find(n => n.id === unitId)!;
    const jabNode = nodes.find(n => n.id === jabatanId)!;

    expect(unitNode.rincian).toEqual([]);
    expect(jabNode.rincian.length).toBe(1);
    expect(jabNode.rincian[0].kebutuhan).toBe(0);
    expect(jabNode.rincian[0].eksisting).toBe(0);
  });

  it('setNodeType to unit discards rincian (Invariant 1)', () => {
    const jabId = useProjectStore.getState().addNode({ type: 'jabatan', nama: 'Pengelola' });
    useProjectStore.getState().addRincian(jabId, 'ahli_muda');
    expect(useProjectStore.getState().project!.nodes.find(n => n.id === jabId)!.rincian.length).toBe(2);

    // Switch type to unit
    useProjectStore.getState().setNodeType(jabId, 'unit');

    const node = useProjectStore.getState().project!.nodes.find(n => n.id === jabId)!;
    expect(node.type).toBe('unit');
    expect(node.rincian).toEqual([]); // Discarded
  });

  it('setKategori nulls all jenjangId values while preserving rows & figures', () => {
    const jabId = useProjectStore.getState().addNode({ type: 'jabatan', nama: 'Analis' });
    useProjectStore.getState().updateRincian(jabId, useProjectStore.getState().project!.nodes.find(n => n.id === jabId)!.rincian[0].id, {
      jenjangId: 'jpt_pratama',
      kebutuhan: 5,
      eksisting: 3,
    });

    useProjectStore.getState().setKategori(jabId, 'fungsional');

    const node = useProjectStore.getState().project!.nodes.find(n => n.id === jabId)!;
    expect(node.kategoriId).toBe('fungsional');
    expect(node.rincian[0].jenjangId).toBeNull();
    expect(node.rincian[0].kebutuhan).toBe(5);
    expect(node.rincian[0].eksisting).toBe(3);
  });

  it('duplicateNode subtree remaps node IDs, rincian IDs, clears nomor, and remaps internal edges', () => {
    const childId = useProjectStore.getState().addNode({ type: 'unit', nama: 'Bidang Pembinaan', parentId: 'root-unit' });
    const jabId = useProjectStore.getState().addNode({ type: 'jabatan', nama: 'Kasi Sekolah', parentId: childId });

    const duplicatedRootId = useProjectStore.getState().duplicateNode(childId, 'subtree');
    const nodes = useProjectStore.getState().project!.nodes;
    const edges = useProjectStore.getState().project!.edges;

    expect(duplicatedRootId).not.toBe(childId);
    const dupChild = nodes.find(n => n.id === duplicatedRootId)!;
    expect(dupChild.nama).toBe('Bidang Pembinaan');
    expect(dupChild.nomor).toBe(''); // Cleared to avoid collision

    // Check internal edge created between duplicated child & duplicated jab
    const internalEdge = edges.find(e => e.source === duplicatedRootId);
    expect(internalEdge).toBeDefined();
    expect(internalEdge?.target).not.toBe(jabId);
  });

  it('renumberFromStructure is idempotent (running twice produces identical output)', () => {
    const child1 = useProjectStore.getState().addNode({ type: 'unit', nama: 'Sekretariat', parentId: 'root-unit' });
    const child2 = useProjectStore.getState().addNode({ type: 'unit', nama: 'Bidang SD', parentId: 'root-unit' });
    useProjectStore.getState().addNode({ type: 'jabatan', nama: 'Analis', parentId: child1 });

    useProjectStore.getState().renumberFromStructure();
    const firstPassNomors = useProjectStore.getState().project!.nodes.map(n => ({ id: n.id, nomor: n.nomor }));

    // Second pass
    useProjectStore.getState().renumberFromStructure();
    const secondPassNomors = useProjectStore.getState().project!.nodes.map(n => ({ id: n.id, nomor: n.nomor }));

    expect(secondPassNomors).toEqual(firstPassNomors);
  });

  it('removeCustomAttribute removes schema entry and strips custom values from all nodes', () => {
    expect(useProjectStore.getState().project!.nodes[0].custom['attr-1']).toBe(10);

    useProjectStore.getState().removeCustomAttribute('attr-1');

    const project = useProjectStore.getState().project!;
    expect(project.attributeSchema.length).toBe(0);
    expect(project.nodes[0].custom['attr-1']).toBeUndefined();
  });
});

describe('makeLink / unlinkNode (M10.5, docs/13-link-nodes.md)', () => {
  const initialProject: Project = {
    id: 'proj-links',
    schemaVersion: '1.0.0',
    configVersion: '2026.1',
    meta: { namaOPD: 'Dinas Kesehatan', kodeOPD: 'DINKES', penyusun: 'Admin' },
    attributeSchema: [],
    nodes: [
      {
        id: 'root-unit',
        type: 'unit',
        nama: 'Dinas Kesehatan',
        nomor: '1',
        rumpun: [],
        rincian: [],
        custom: {},
        position: { x: 0, y: 0 },
        collapsed: false,
        order: 0,
      },
      {
        id: 'empty-unit',
        type: 'unit',
        nama: 'Puskesmas Kota Timur',
        nomor: '1.1',
        rumpun: [],
        rincian: [],
        custom: {},
        position: { x: 0, y: 100 },
        collapsed: false,
        order: 0,
        kepalaUnit: { jenjangId: null, kebutuhan: 1, eksisting: 0 },
      },
      {
        id: 'unit-with-child',
        type: 'unit',
        nama: 'Bidang Yankes',
        nomor: '1.2',
        rumpun: [],
        rincian: [],
        custom: {},
        position: { x: 0, y: 200 },
        collapsed: false,
        order: 1,
      },
      {
        id: 'child-of-unit',
        type: 'jabatan',
        nama: 'Staf',
        nomor: '1.2.1',
        kategoriId: 'pelaksana',
        rumpun: [],
        rincian: [{ id: 'r1', jenjangId: null, kebutuhan: 1, eksisting: 1 }],
        custom: {},
        position: { x: 0, y: 300 },
        collapsed: false,
        order: 0,
      },
    ],
    edges: [{ id: 'e1', source: 'unit-with-child', target: 'child-of-unit', kind: 'hirarki' }],
    viewport: { x: 0, y: 0, zoom: 1 },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    useProjectStore.getState().setProject(structuredClone(initialProject));
    useProjectIndexStore.setState({ index: null });
    useHistoryStore.getState().clearHistory();
  });

  it('makeLink converts an empty unit into a link node and clears kepalaUnit', () => {
    const result = useProjectStore.getState().makeLink('empty-unit', {
      kodeOPD: 'PKM-KTIM',
      namaProject: 'Puskesmas Kota Timur',
    });

    expect(result.ok).toBe(true);
    const node = useProjectStore.getState().project!.nodes.find(n => n.id === 'empty-unit')!;
    expect(node.link?.kodeOPD).toBe('PKM-KTIM');
    expect(node.kepalaUnit).toBeUndefined();
  });

  it('makeLink refuses a unit that has children', () => {
    const result = useProjectStore.getState().makeLink('unit-with-child', {
      kodeOPD: 'PKM-X',
      namaProject: 'Puskesmas X',
    });

    expect(result).toEqual({ ok: false, reason: 'has-children' });
    expect(useProjectStore.getState().project!.nodes.find(n => n.id === 'unit-with-child')!.link).toBeUndefined();
  });

  it('makeLink refuses a link that would form a cycle', () => {
    useProjectIndexStore.setState({
      index: {
        version: 1,
        activeId: null,
        entries: [
          {
            id: 'target',
            namaOPD: 'Puskesmas Kota Timur',
            kodeOPD: 'PKM-KTIM',
            nodeCount: 1,
            totalKebutuhan: 0,
            totalEksisting: 0,
            updatedAt: '',
            lastExportedAt: null,
            linkedCodes: ['DINKES'], // target already links back to this project
          },
        ],
      },
    });

    const result = useProjectStore.getState().makeLink('empty-unit', {
      kodeOPD: 'PKM-KTIM',
      namaProject: 'Puskesmas Kota Timur',
    });

    expect(result).toEqual({ ok: false, reason: 'cycle' });
  });

  it('unlinkNode restores an ordinary empty unit', () => {
    useProjectStore.getState().makeLink('empty-unit', {
      kodeOPD: 'PKM-KTIM',
      namaProject: 'Puskesmas Kota Timur',
    });
    expect(useProjectStore.getState().project!.nodes.find(n => n.id === 'empty-unit')!.link).toBeDefined();

    useProjectStore.getState().unlinkNode('empty-unit');

    const node = useProjectStore.getState().project!.nodes.find(n => n.id === 'empty-unit')!;
    expect(node.link).toBeUndefined();
    expect(node.type).toBe('unit');
  });

  it('makeLink/unlinkNode are undoable (recorded in history, not transient)', () => {
    useProjectStore.getState().makeLink('empty-unit', {
      kodeOPD: 'PKM-KTIM',
      namaProject: 'Puskesmas Kota Timur',
    });
    expect(useProjectStore.getState().project!.nodes.find(n => n.id === 'empty-unit')!.link).toBeDefined();

    const undone = useProjectStore.getState().undo();
    expect(undone).toBe(true);
    expect(useProjectStore.getState().project!.nodes.find(n => n.id === 'empty-unit')!.link).toBeUndefined();

    const redone = useProjectStore.getState().redo();
    expect(redone).toBe(true);
    expect(useProjectStore.getState().project!.nodes.find(n => n.id === 'empty-unit')!.link).toBeDefined();
  });
});
