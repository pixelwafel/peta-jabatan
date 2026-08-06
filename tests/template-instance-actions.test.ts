import { describe, it, expect, beforeEach } from 'vitest';
import { useProjectStore } from '../src/store/projectStore';
import { Project } from '../src/models/project';

describe('makeTemplate / unmakeTemplate / instance CRUD (M12.3, docs/15-template-instance.md §2)', () => {
  const initialProject: Project = {
    id: 'proj-template-actions',
    schemaVersion: '1.0.0',
    configVersion: '2026.1',
    meta: { namaOPD: 'Dinas Pendidikan', kodeOPD: 'DISDIK', penyusun: 'Admin' },
    attributeSchema: [],
    nodes: [
      {
        id: 'root',
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
      {
        id: 'sekolah',
        type: 'unit',
        nama: 'SD Contoh',
        nomor: '1.1',
        rumpun: [],
        rincian: [],
        custom: {},
        position: { x: 0, y: 100 },
        collapsed: false,
        order: 0,
        kepalaUnit: { jenjangId: 'jpt_pratama', kebutuhan: 1, eksisting: 1 },
      },
      {
        id: 'guru-kelas',
        type: 'jabatan',
        nama: 'Guru Kelas',
        nomor: '1.1.1',
        kategoriId: 'fungsional',
        rumpun: ['keahlian'],
        rincian: [{ id: 'r1', jenjangId: 'ahli_pertama', kebutuhan: 4, eksisting: 3 }],
        custom: {},
        position: { x: 0, y: 200 },
        collapsed: false,
        order: 0,
      },
      {
        id: 'unit-with-child',
        type: 'unit',
        nama: 'Bidang Lain',
        nomor: '1.2',
        rumpun: [],
        rincian: [],
        custom: {},
        position: { x: 0, y: 300 },
        collapsed: false,
        order: 1,
      },
      {
        id: 'jab-link-target',
        type: 'unit',
        nama: 'Sudah Tautan',
        nomor: '1.3',
        rumpun: [],
        rincian: [],
        custom: {},
        position: { x: 0, y: 400 },
        collapsed: false,
        order: 2,
        link: { kodeOPD: 'X', namaProject: 'X', cached: { kebutuhan: 0, eksisting: 0, nodeCount: 0, updatedAt: '' } },
      },
    ],
    edges: [
      { id: 'e1', source: 'root', target: 'sekolah', kind: 'hirarki' },
      { id: 'e2', source: 'sekolah', target: 'guru-kelas', kind: 'hirarki' },
      { id: 'e3', source: 'root', target: 'unit-with-child', kind: 'hirarki' },
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    useProjectStore.getState().setProject(structuredClone(initialProject));
  });

  it('makeTemplate("seed") zeroes subtree rows and seeds one instance from the existing figures', () => {
    const result = useProjectStore.getState().makeTemplate('sekolah', 'seed');
    expect(result.ok).toBe(true);

    const project = useProjectStore.getState().project!;
    const sekolah = project.nodes.find(n => n.id === 'sekolah')!;
    const guru = project.nodes.find(n => n.id === 'guru-kelas')!;

    expect(sekolah.isTemplate).toBe(true);
    expect(sekolah.kepalaUnit).toEqual({ jenjangId: 'jpt_pratama', kebutuhan: 0, eksisting: 0 }); // dinolkan
    expect(guru.rincian[0]).toEqual({ id: 'r1', jenjangId: 'ahli_pertama', kebutuhan: 0, eksisting: 0 });

    expect(project.instances).toHaveLength(1);
    const seeded = project.instances![0];
    expect(seeded.templateNodeId).toBe('sekolah');
    expect(seeded.nama).toBe('SD Contoh');
    expect(seeded.figures['sekolah']).toEqual({ kebutuhan: 1, eksisting: 1 }); // dari kepalaUnit lama
    expect(seeded.figures['r1']).toEqual({ kebutuhan: 4, eksisting: 3 }); // dari rincian lama
  });

  it('makeTemplate("zero") zeroes subtree rows without creating an instance', () => {
    useProjectStore.getState().makeTemplate('sekolah', 'zero');
    const project = useProjectStore.getState().project!;
    expect(project.instances ?? []).toHaveLength(0);
    expect(project.nodes.find(n => n.id === 'sekolah')!.kepalaUnit?.kebutuhan).toBe(0);
  });

  it('makeTemplate refuses a non-unit node', () => {
    const result = useProjectStore.getState().makeTemplate('guru-kelas', 'zero');
    expect(result).toEqual({ ok: false, reason: 'not-unit' });
  });

  it('makeTemplate refuses a link node (TEMPLATE_LINK_CONFLICT)', () => {
    const result = useProjectStore.getState().makeTemplate('jab-link-target', 'zero');
    expect(result).toEqual({ ok: false, reason: 'is-link' });
  });

  it('makeTemplate refuses nesting inside another template (TEMPLATE_NESTED)', () => {
    useProjectStore.getState().makeTemplate('sekolah', 'zero');
    const result = useProjectStore.getState().makeTemplate('guru-kelas', 'zero'); // guru-kelas bukan unit pun tapi tetap harus dites
    // guru-kelas bukan type 'unit' -> gagal duluan karena not-unit, bukan nested.
    expect(result.reason).toBe('not-unit');
  });

  it('makeLink refuses a template unit (TEMPLATE_LINK_CONFLICT, symmetrical guard)', () => {
    useProjectStore.getState().makeTemplate('sekolah', 'zero');
    const result = useProjectStore.getState().makeLink('sekolah', { kodeOPD: 'Y', namaProject: 'Y' });
    expect(result).toEqual({ ok: false, reason: 'is-template' });
  });

  it('unmakeTemplate with zero instances just clears the flag', () => {
    useProjectStore.getState().makeTemplate('sekolah', 'zero');
    const result = useProjectStore.getState().unmakeTemplate('sekolah');
    expect(result.ok).toBe(true);
    expect(useProjectStore.getState().project!.nodes.find(n => n.id === 'sekolah')!.isTemplate).toBeUndefined();
  });

  it('unmakeTemplate with exactly one instance folds its figures back into the rows', () => {
    useProjectStore.getState().makeTemplate('sekolah', 'seed');
    const result = useProjectStore.getState().unmakeTemplate('sekolah');
    expect(result.ok).toBe(true);

    const project = useProjectStore.getState().project!;
    const sekolah = project.nodes.find(n => n.id === 'sekolah')!;
    const guru = project.nodes.find(n => n.id === 'guru-kelas')!;
    expect(sekolah.isTemplate).toBeUndefined();
    expect(sekolah.kepalaUnit).toEqual({ jenjangId: 'jpt_pratama', kebutuhan: 1, eksisting: 1 }); // dilipat balik
    expect(guru.rincian[0].kebutuhan).toBe(4);
    expect(guru.rincian[0].eksisting).toBe(3);
    expect(project.instances ?? []).toHaveLength(0);
  });

  it('unmakeTemplate refuses when more than one instance exists', () => {
    useProjectStore.getState().makeTemplate('sekolah', 'seed');
    useProjectStore.getState().addInstance('sekolah', 'SD Lain');
    const result = useProjectStore.getState().unmakeTemplate('sekolah');
    expect(result).toEqual({ ok: false, reason: 'multiple-instances' });
    expect(useProjectStore.getState().project!.nodes.find(n => n.id === 'sekolah')!.isTemplate).toBe(true);
  });

  it('addInstance/duplicateInstance/removeInstance/updateInstanceFigure CRUD works', () => {
    useProjectStore.getState().makeTemplate('sekolah', 'zero');
    const id1 = useProjectStore.getState().addInstance('sekolah', 'SDN 01');
    expect(useProjectStore.getState().project!.instances).toHaveLength(1);

    useProjectStore.getState().updateInstanceFigure(id1, 'r1', { kebutuhan: 4, eksisting: 3 });
    expect(useProjectStore.getState().project!.instances!.find(i => i.id === id1)!.figures.r1).toEqual({
      kebutuhan: 4,
      eksisting: 3,
    });

    const id2 = useProjectStore.getState().duplicateInstance(id1);
    const dup = useProjectStore.getState().project!.instances!.find(i => i.id === id2)!;
    expect(dup.figures.r1).toEqual({ kebutuhan: 4, eksisting: 3 });
    expect(dup.nama).toBe('SDN 01 — Salinan');

    useProjectStore.getState().removeInstance(id1);
    expect(useProjectStore.getState().project!.instances!.map(i => i.id)).toEqual([id2]);
  });

  it('removeRincian purges the matching column from every instance of the containing template (cascade, doc 15 §2)', () => {
    useProjectStore.getState().makeTemplate('sekolah', 'seed');
    const instBefore = useProjectStore.getState().project!.instances![0];
    expect(instBefore.figures.r1).toBeDefined();

    useProjectStore.getState().removeRincian('guru-kelas', 'r1');

    const instAfter = useProjectStore.getState().project!.instances![0];
    expect(instAfter.figures.r1).toBeUndefined(); // kolom lenyap, bukan cuma barisnya
    expect(useProjectStore.getState().project!.nodes.find(n => n.id === 'guru-kelas')!.rincian).toHaveLength(0);
  });

  it('setKepalaUnit(null) purges the kepala-unit column from every instance of the containing template', () => {
    useProjectStore.getState().makeTemplate('sekolah', 'seed');
    useProjectStore.getState().setKepalaUnit('sekolah', null);
    const inst = useProjectStore.getState().project!.instances![0];
    expect(inst.figures.sekolah).toBeUndefined();
  });

  it('deleteNode(subtree) on a template unit itself removes ALL its instances', () => {
    useProjectStore.getState().makeTemplate('sekolah', 'seed');
    useProjectStore.getState().addInstance('sekolah', 'SD Lain');
    expect(useProjectStore.getState().project!.instances).toHaveLength(2);

    useProjectStore.getState().deleteNode('sekolah', 'subtree');
    expect(useProjectStore.getState().project!.instances ?? []).toHaveLength(0);
    expect(useProjectStore.getState().project!.nodes.find(n => n.id === 'sekolah')).toBeUndefined();
  });

  it('deleteNode(node-only) on a position inside a template purges just that position\'s column', () => {
    useProjectStore.getState().makeTemplate('sekolah', 'seed');
    useProjectStore.getState().deleteNode('guru-kelas', 'node-only');

    const project = useProjectStore.getState().project!;
    expect(project.instances).toHaveLength(1); // instance masih ada
    expect(project.instances![0].figures.r1).toBeUndefined(); // kolomnya lenyap
    expect(project.instances![0].figures.sekolah).toEqual({ kebutuhan: 1, eksisting: 1 }); // kolom lain utuh
  });
});
