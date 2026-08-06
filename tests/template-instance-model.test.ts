import { describe, it, expect } from 'vitest';
import { zUnitInstance } from '../src/schema/project';
import { UnitInstance } from '../src/models/project';

describe('UnitInstance model/schema alignment (M12.0, docs/15-template-instance.md §1)', () => {
  it('accepts the doc-shaped instance (id/templateNodeId/nama/kode/figures/keterangan)', () => {
    const instance: UnitInstance = {
      id: 'inst-1',
      templateNodeId: 'unit-sekolah',
      nama: 'SDN 01 Kota Timur',
      kode: '20112233',
      figures: { 'rincian-1': { kebutuhan: 1, eksisting: 1 } },
      keterangan: 'Catatan',
    };
    const parsed = zUnitInstance.safeParse(instance);
    expect(parsed.success).toBe(true);
  });

  it('requires templateNodeId (distinguishes instances across multiple template units, doc 15 §6)', () => {
    const invalid = {
      id: 'inst-1',
      nama: 'SDN 01',
      figures: {},
    };
    expect(zUnitInstance.safeParse(invalid).success).toBe(false);
  });

  it('rejects negative figures on an instance cell', () => {
    const instance = {
      id: 'inst-1',
      templateNodeId: 'unit-sekolah',
      nama: 'SDN 01',
      figures: { r1: { kebutuhan: -1, eksisting: 0 } },
    };
    expect(zUnitInstance.safeParse(instance).success).toBe(false);
  });

  it('kode and keterangan are optional', () => {
    const instance: UnitInstance = {
      id: 'inst-1',
      templateNodeId: 'unit-sekolah',
      nama: 'SDN 01',
      figures: {},
    };
    expect(zUnitInstance.safeParse(instance).success).toBe(true);
  });
});
