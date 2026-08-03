import { describe, it, expect, beforeEach } from 'vitest';
import { useProjectStore } from '../src/store/projectStore';
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
