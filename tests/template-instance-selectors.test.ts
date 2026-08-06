import { describe, it, expect } from 'vitest';
import {
  buildTemplateUnitIds,
  containingTemplateUnitId,
  isInTemplateSubtree,
  computeInstanceTotals,
  sumInstanceTotals,
  countInstancesFor,
  columnBlastRadius,
} from '../src/selectors/templateInstance';
import { getStructureIndex, resetRebuildCount } from '../src/selectors/structureIndex';
import { OrgNode } from '../src/models/node';
import { OrgEdge } from '../src/models/edge';
import { UnitInstance } from '../src/models/project';

function node(partial: Partial<OrgNode> & Pick<OrgNode, 'id' | 'type'>): OrgNode {
  return {
    nama: partial.id,
    nomor: '',
    rumpun: [],
    rincian: [],
    custom: {},
    position: { x: 0, y: 0 },
    collapsed: false,
    order: 0,
    ...partial,
  };
}

describe('templateInstance selectors (M12.1, docs/15-template-instance.md §3)', () => {
  // Struktur: root -> sekolah (isTemplate) -> guru-kelas (jabatan)
  //                                        -> tata-usaha (unit biasa) -> staf-tu (jabatan)
  //           root -> smp (isTemplate, template kedua/berdampingan, doc 15 §6)
  const nodes: OrgNode[] = [
    node({ id: 'root', type: 'unit' }),
    node({ id: 'sekolah', type: 'unit', isTemplate: true }),
    node({ id: 'guru-kelas', type: 'jabatan' }),
    node({ id: 'tata-usaha', type: 'unit' }),
    node({ id: 'staf-tu', type: 'jabatan' }),
    node({ id: 'smp', type: 'unit', isTemplate: true }),
    node({ id: 'guru-smp', type: 'jabatan' }),
    node({ id: 'luar', type: 'jabatan' }), // bukan bagian template mana pun
  ];
  const edges: OrgEdge[] = [
    { id: 'e1', source: 'root', target: 'sekolah', kind: 'hirarki' },
    { id: 'e2', source: 'sekolah', target: 'guru-kelas', kind: 'hirarki' },
    { id: 'e3', source: 'sekolah', target: 'tata-usaha', kind: 'hirarki' },
    { id: 'e4', source: 'tata-usaha', target: 'staf-tu', kind: 'hirarki' },
    { id: 'e5', source: 'root', target: 'smp', kind: 'hirarki' },
    { id: 'e6', source: 'smp', target: 'guru-smp', kind: 'hirarki' },
    { id: 'e7', source: 'root', target: 'luar', kind: 'hirarki' },
  ];

  resetRebuildCount();
  const idx = getStructureIndex(nodes, edges);
  const templateUnitIds = buildTemplateUnitIds(nodes);

  it('buildTemplateUnitIds collects every isTemplate unit', () => {
    expect(templateUnitIds).toEqual(new Set(['sekolah', 'smp']));
  });

  it('containingTemplateUnitId returns itself for the template unit node', () => {
    expect(containingTemplateUnitId('sekolah', idx, templateUnitIds)).toBe('sekolah');
  });

  it('containingTemplateUnitId finds the template ancestor for a direct position child', () => {
    expect(containingTemplateUnitId('guru-kelas', idx, templateUnitIds)).toBe('sekolah');
  });

  it('containingTemplateUnitId finds the template ancestor through a nested sub-unit (doc 15 §1 "Unit children are allowed")', () => {
    expect(containingTemplateUnitId('staf-tu', idx, templateUnitIds)).toBe('sekolah');
  });

  it('containingTemplateUnitId keeps two side-by-side templates distinct (doc 15 §6)', () => {
    expect(containingTemplateUnitId('guru-smp', idx, templateUnitIds)).toBe('smp');
  });

  it('containingTemplateUnitId returns null for a node outside any template subtree', () => {
    expect(containingTemplateUnitId('luar', idx, templateUnitIds)).toBeNull();
    expect(containingTemplateUnitId('root', idx, templateUnitIds)).toBeNull();
  });

  it('isInTemplateSubtree mirrors containingTemplateUnitId as a boolean', () => {
    expect(isInTemplateSubtree('guru-kelas', idx, templateUnitIds)).toBe(true);
    expect(isInTemplateSubtree('luar', idx, templateUnitIds)).toBe(false);
  });

  describe('computeInstanceTotals / sumInstanceTotals / countInstancesFor', () => {
    const instances: UnitInstance[] = [
      {
        id: 'i1',
        templateNodeId: 'sekolah',
        nama: 'SDN 01',
        figures: {
          sekolah: { kebutuhan: 1, eksisting: 1 }, // kolom Kepsek (keyed id unit template)
          'r-ahli-pertama': { kebutuhan: 4, eksisting: 3 },
          'r-ahli-muda': { kebutuhan: 2, eksisting: 2 },
        },
      },
      {
        id: 'i2',
        templateNodeId: 'sekolah',
        nama: 'SDN 02',
        figures: {
          sekolah: { kebutuhan: 1, eksisting: 0 },
          'r-ahli-pertama': { kebutuhan: 5, eksisting: 5 },
          'r-ahli-muda': { kebutuhan: 1, eksisting: 1 },
        },
      },
      {
        id: 'i3',
        templateNodeId: 'smp', // template LAIN — tidak boleh ikut ke total 'sekolah'
        nama: 'SMPN 01',
        figures: { smp: { kebutuhan: 1, eksisting: 1 } },
      },
    ];

    it('sums figures per column across instances of the same template, ignoring other templates', () => {
      const totals = computeInstanceTotals(instances, 'sekolah');
      expect(totals.get('sekolah')).toEqual({ kebutuhan: 2, eksisting: 1, selisih: -1 });
      expect(totals.get('r-ahli-pertama')).toEqual({ kebutuhan: 9, eksisting: 8, selisih: -1 });
      expect(totals.get('r-ahli-muda')).toEqual({ kebutuhan: 3, eksisting: 3, selisih: 0 });
      expect(totals.has('smp')).toBe(false); // kolom milik instance template 'smp' tidak bocor ke sini
    });

    it('sumInstanceTotals adds up every column for the template unit subtree total', () => {
      const totals = computeInstanceTotals(instances, 'sekolah');
      expect(sumInstanceTotals(totals)).toEqual({ kebutuhan: 14, eksisting: 12, selisih: -2 });
    });

    it('countInstancesFor counts only instances belonging to the given template', () => {
      expect(countInstancesFor(instances, 'sekolah')).toBe(2);
      expect(countInstancesFor(instances, 'smp')).toBe(1);
    });

    it('columnBlastRadius (M12.10) counts only instances with non-zero data in that column and sums their totals', () => {
      const radius = columnBlastRadius(instances, 'sekolah', 'r-ahli-pertama');
      expect(radius.instanceCount).toBe(2); // kedua SDN punya angka di kolom ini
      expect(radius.totalKebutuhan).toBe(9);
      expect(radius.totalEksisting).toBe(8);
    });

    it('columnBlastRadius returns zero for a column with no data anywhere (safe to remove silently)', () => {
      const radius = columnBlastRadius(instances, 'sekolah', 'kolom-tak-terpakai');
      expect(radius).toEqual({ instanceCount: 0, totalKebutuhan: 0, totalEksisting: 0 });
    });

    it('columnBlastRadius ignores instances of a different template', () => {
      const radius = columnBlastRadius(instances, 'smp', 'smp');
      expect(radius.instanceCount).toBe(1);
    });
  });
});
