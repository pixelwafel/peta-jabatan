import { describe, it, expect } from 'vitest';
import { daftarOpdBawaan, buildOpdIndex, resolveOpdEntry, OpdEntry } from '../src/config/daftarOpd';

describe('daftar-opd config loader (M11.0, docs/14-recap-dashboard.md §1)', () => {
  it('daftarOpdBawaan loads with a listVersion and at least one entry per doc-required kelompok', () => {
    expect(daftarOpdBawaan.listVersion).toBeTruthy();
    expect(daftarOpdBawaan.opd.length).toBeGreaterThan(0);
    const kelompok = new Set(daftarOpdBawaan.opd.map(o => o.kelompok));
    expect(kelompok.has('Dinas')).toBe(true);
    expect(kelompok.has('Badan')).toBe(true);
  });

  it('buildOpdIndex resolves entries by kode', () => {
    const idx = buildOpdIndex();
    const dinkes = resolveOpdEntry('DINKES', idx);
    expect(dinkes?.nama).toBe('Dinas Kesehatan');
  });

  it('buildOpdIndex resolves historical codes via alias (§1.1 code deprecation)', () => {
    const idx = buildOpdIndex();
    const viaAlias = resolveOpdEntry('DISKOMINFO', idx);
    const viaCurrent = resolveOpdEntry('DISKOMINFOTIK', idx);
    expect(viaAlias).toBe(viaCurrent);
    expect(viaAlias?.kode).toBe('DISKOMINFOTIK');
  });

  it('buildOpdIndex merges custom OPD entries on top of the bundled list', () => {
    const custom: OpdEntry[] = [{ kode: 'PKM-KTIM', nama: 'Puskesmas Kota Timur', kelompok: 'Puskesmas' }];
    const idx = buildOpdIndex(custom);
    expect(resolveOpdEntry('PKM-KTIM', idx)?.nama).toBe('Puskesmas Kota Timur');
    // Bawaan tetap ada
    expect(resolveOpdEntry('DINKES', idx)).toBeDefined();
  });

  it('resolveOpdEntry returns undefined for an unknown kode (goes to "Lainnya" group)', () => {
    const idx = buildOpdIndex();
    expect(resolveOpdEntry('KODE-TIDAK-DIKENAL', idx)).toBeUndefined();
  });
});
