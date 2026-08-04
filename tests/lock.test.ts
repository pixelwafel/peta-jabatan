import { describe, it, expect, beforeEach } from 'vitest';
import { useProjectStore } from '../src/store/projectStore';
import { isLocked, isSubtreeLocked } from '../src/selectors/guards';
import { Project } from '../src/models/project';

describe('Lock — individual per node, cascade is just a bulk shortcut', () => {
  const initialProject: Project = {
    id: 'proj-lock',
    schemaVersion: '1.0.0',
    configVersion: '2026.1',
    meta: { namaOPD: 'Dinas Pendidikan', kodeOPD: 'DISDIK', penyusun: 'Admin' },
    attributeSchema: [],
    nodes: [
      {
        id: 'root-unit',
        type: 'unit',
        nama: 'Dinas Pendidikan',
        nomor: '1',
        rumpun: [],
        rincian: [],
        custom: {},
        position: { x: 0, y: 0 },
        collapsed: false,
        order: 0,
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

  function buildBranch() {
    const unitId = useProjectStore.getState().addNode({
      type: 'unit',
      nama: 'Bidang A',
      parentId: 'root-unit',
    });
    const jabId = useProjectStore.getState().addNode({
      type: 'jabatan',
      nama: 'Analis',
      parentId: unitId,
    });
    return { unitId, jabId };
  }

  it('locking a Unit does NOT lock its children (no inheritance)', () => {
    const { unitId, jabId } = buildBranch();

    useProjectStore.getState().setLocked(unitId, true);

    const project = useProjectStore.getState().project!;
    expect(isLocked(project.nodes, project.edges, unitId)).toBe(true);
    expect(isLocked(project.nodes, project.edges, jabId)).toBe(false);

    // Child stays editable
    useProjectStore.getState().updateNode(jabId, { nama: 'Analis Kebijakan' });
    expect(useProjectStore.getState().project!.nodes.find(n => n.id === jabId)!.nama).toBe(
      'Analis Kebijakan'
    );
  });

  it('cascade lock explicitly locks node + all descendants, individually', () => {
    const { unitId, jabId } = buildBranch();

    useProjectStore.getState().setLocked(unitId, true, { cascade: true });

    const project = useProjectStore.getState().project!;
    expect(project.nodes.find(n => n.id === unitId)!.locked).toBe(true);
    expect(project.nodes.find(n => n.id === jabId)!.locked).toBe(true);

    // Editing the child is blocked now that it's explicitly locked
    useProjectStore.getState().updateNode(jabId, { nama: 'Blocked' });
    expect(useProjectStore.getState().project!.nodes.find(n => n.id === jabId)!.nama).toBe(
      'Analis'
    );
  });

  it('after cascade lock, a single descendant can be unlocked individually without affecting siblings', () => {
    const unitId = useProjectStore.getState().addNode({
      type: 'unit',
      nama: 'Bidang A',
      parentId: 'root-unit',
    });
    const jabA = useProjectStore.getState().addNode({ type: 'jabatan', nama: 'Analis A', parentId: unitId });
    const jabB = useProjectStore.getState().addNode({ type: 'jabatan', nama: 'Analis B', parentId: unitId });

    useProjectStore.getState().setLocked(unitId, true, { cascade: true });
    useProjectStore.getState().setLocked(jabA, false);

    const project = useProjectStore.getState().project!;
    expect(isLocked(project.nodes, project.edges, jabA)).toBe(false);
    expect(isLocked(project.nodes, project.edges, jabB)).toBe(true);
    // Parent's own lock is untouched by unlocking one child
    expect(isLocked(project.nodes, project.edges, unitId)).toBe(true);
  });

  it('cascade unlock reopens node + all descendants symmetrically', () => {
    const { unitId, jabId } = buildBranch();

    useProjectStore.getState().setLocked(unitId, true, { cascade: true });
    useProjectStore.getState().setLocked(unitId, false, { cascade: true });

    const project = useProjectStore.getState().project!;
    expect(project.nodes.find(n => n.id === unitId)!.locked).toBe(false);
    expect(project.nodes.find(n => n.id === jabId)!.locked).toBe(false);
  });

  it('addNode is still blocked under a locked parent (structural protection, independent of children)', () => {
    const { unitId } = buildBranch();
    useProjectStore.getState().setLocked(unitId, true);

    const newId = useProjectStore.getState().addNode({ type: 'jabatan', nama: 'X', parentId: unitId });
    expect(newId).toBe('');
  });

  it('isSubtreeLocked reports true if any explicit lock exists below, for subtree-delete protection', () => {
    const { unitId, jabId } = buildBranch();
    useProjectStore.getState().setLocked(jabId, true);

    const project = useProjectStore.getState().project!;
    expect(isLocked(project.nodes, project.edges, unitId)).toBe(false);
    expect(isSubtreeLocked(project.nodes, project.edges, unitId)).toBe(true);

    useProjectStore.getState().deleteNode(unitId, 'subtree');
    // Blocked — jabId inside the subtree is explicitly locked
    expect(useProjectStore.getState().project!.nodes.find(n => n.id === unitId)).toBeDefined();
  });
});
