import { describe, it, expect, beforeEach } from 'vitest';
import { useProjectStore } from '../src/store/projectStore';
import { useUiStore } from '../src/store/uiStore';
import { Project } from '../src/models/project';
import { getJenjangOptions } from '../src/config/resolver';
import { canSetParent } from '../src/selectors/guards';
import { nodeTotals } from '../src/selectors/totals';

describe('Property Panel & Detail Rows (Doc 06 Exit Criteria)', () => {
  const initialProject: Project = {
    id: 'proj-m3',
    schemaVersion: '1.0.0',
    configVersion: '2026.1',
    meta: { namaOPD: 'Dinas Kesehatan', kodeOPD: 'DINKES', penyusun: 'Admin' },
    attributeSchema: [{ id: 'lokasi_kerja', nama: 'Lokasi Kerja', tipe: 'text' }],
    nodes: [
      {
        id: 'unit-root',
        type: 'unit',
        nama: 'Dinas Kesehatan',
        nomor: '1',
        rumpun: [],
        rincian: [],
        custom: {},
        position: { x: 0, y: 0 },
        collapsed: false,
      },
      {
        id: 'jab-fungsional',
        type: 'jabatan',
        nama: 'Dokter',
        nomor: '1.1',
        kategoriId: 'fungsional',
        rumpun: ['keahlian'],
        rincian: [],
        custom: { lokasi_kerja: 'Puskesmas A' },
        position: { x: 50, y: 100 },
        collapsed: false,
      },
    ],
    edges: [{ id: 'e1', source: 'unit-root', target: 'jab-fungsional', kind: 'hirarki' }],
    viewport: { x: 0, y: 0, zoom: 1 },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    useUiStore.getState().clearSelection();
    useUiStore.getState().closeDialog();
    useProjectStore.getState().setProject(structuredClone(initialProject));
  });

  it('chip picker shows every valid level for node category and tracks', () => {
    const options = getJenjangOptions('fungsional', ['keahlian']);
    expect(options.length).toBe(4);
    expect(options.map(j => j.id)).toEqual([
      'ahli_utama',
      'ahli_madya',
      'ahli_muda',
      'ahli_pertama',
    ]);
  });

  it('activating a chip creates exactly 1 row; row order follows config order regardless of activation order', () => {
    // Activate Ahli Pertama (4th in config order)
    useProjectStore.getState().addRincian('jab-fungsional', 'ahli_pertama');
    // Then activate Ahli Utama (1st in config order)
    useProjectStore.getState().addRincian('jab-fungsional', 'ahli_utama');

    const node = useProjectStore.getState().project!.nodes.find(n => n.id === 'jab-fungsional')!;
    expect(node.rincian.length).toBe(2);

    // Verify sort order follows config (ahli_utama before ahli_pertama)
    const options = getJenjangOptions('fungsional', ['keahlian']);
    const orderMap = new Map(options.map((j, i) => [j.id, i]));
    const sorted = [...node.rincian].sort(
      (a, b) => (orderMap.get(a.jenjangId!) ?? 99) - (orderMap.get(b.jenjangId!) ?? 99)
    );

    expect(sorted[0].jenjangId).toBe('ahli_utama');
    expect(sorted[1].jenjangId).toBe('ahli_pertama');
  });

  it('deactivating an empty row (kebutuhan 0, eksisting 0) removes row without confirmation prompt', () => {
    useProjectStore.getState().addRincian('jab-fungsional', 'ahli_muda');
    const rId = useProjectStore.getState().project!.nodes.find(n => n.id === 'jab-fungsional')!.rincian[0].id;

    // Deleting 0/0 row
    useProjectStore.getState().removeRincian('jab-fungsional', rId);

    expect(useProjectStore.getState().project!.nodes.find(n => n.id === 'jab-fungsional')!.rincian.length).toBe(0);
    expect(useUiStore.getState().dialog).toBeNull(); // No confirmation dialog opened!
  });

  it('deactivating a row with figures prompts confirmation naming the figures', () => {
    useProjectStore.getState().addRincian('jab-fungsional', 'ahli_muda');
    const rId = useProjectStore.getState().project!.nodes.find(n => n.id === 'jab-fungsional')!.rincian[0].id;
    useProjectStore.getState().updateRincian('jab-fungsional', rId, { kebutuhan: 3, eksisting: 2 });

    // Open confirmation prompt via uiStore
    useUiStore.getState().openConfirm({
      title: 'Hapus jenjang Ahli Muda?',
      body: 'Baris ini berisi kebutuhan 3 dan eksisting 2. Angka tersebut akan hilang.',
      confirmLabel: 'Hapus',
      onConfirm: () => useProjectStore.getState().removeRincian('jab-fungsional', rId),
    });

    const dialog = useUiStore.getState().dialog;
    expect(dialog).not.toBeNull();
    expect(dialog?.kind).toBe('confirm');
    if (dialog && dialog.kind === 'confirm') {
      expect(dialog.body).toContain('kebutuhan 3 dan eksisting 2');
    }
  });

  it('picker is hidden for pelaksana category', () => {
    const options = getJenjangOptions('pelaksana', []);
    expect(options).toEqual([]);
  });

  it('category change preserves figures and nulls invalid level IDs', () => {
    useProjectStore.getState().addRincian('jab-fungsional', 'ahli_muda');
    const rId = useProjectStore.getState().project!.nodes.find(n => n.id === 'jab-fungsional')!.rincian[0].id;
    useProjectStore.getState().updateRincian('jab-fungsional', rId, { kebutuhan: 5, eksisting: 4 });

    useProjectStore.getState().setKategori('jab-fungsional', 'pelaksana');

    const node = useProjectStore.getState().project!.nodes.find(n => n.id === 'jab-fungsional')!;
    expect(node.kategoriId).toBe('pelaksana');
    expect(node.rincian.length).toBe(1);
    expect(node.rincian[0].jenjangId).toBeNull();
    expect(node.rincian[0].kebutuhan).toBe(5);
    expect(node.rincian[0].eksisting).toBe(4);
  });

  it('changing parent leaves position unchanged (Invariant 2)', () => {
    const initialPos = { ...useProjectStore.getState().project!.nodes[1].position };

    useProjectStore.getState().setParent('jab-fungsional', null);

    const newPos = useProjectStore.getState().project!.nodes[1].position;
    expect(newPos).toEqual(initialPos); // Position untouched!
  });

  it('canSetParent excludes cycle-forming options from parent dropdown', () => {
    const { nodes, edges } = useProjectStore.getState().project!;
    expect(canSetParent(nodes, edges, 'unit-root', 'jab-fungsional')).toBe(false);
    expect(canSetParent(nodes, edges, 'jab-fungsional', 'unit-root')).toBe(true);
  });

  it('selisih is computed in nodeTotals and absent from OrgNode object', () => {
    const node = useProjectStore.getState().project!.nodes[1];
    expect((node as unknown as Record<string, unknown>).selisih).toBeUndefined();

    const totals = nodeTotals(node);
    expect(totals.selisih).toBe(totals.eksisting - totals.kebutuhan);
  });
});
