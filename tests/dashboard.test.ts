import { describe, it, expect } from 'vitest';
import { computeTopLevel, sumTopLevelTotals, isEntryStale, buildDashboardCards, LAINNYA_KELOMPOK } from '../src/selectors/dashboard';
import { ProjectIndexEntry } from '../src/persistence/types';
import { buildOpdIndex, OpdEntry } from '../src/config/daftarOpd';

function entry(partial: Partial<ProjectIndexEntry> & Pick<ProjectIndexEntry, 'id' | 'kodeOPD'>): ProjectIndexEntry {
  return {
    namaOPD: partial.kodeOPD,
    nodeCount: 0,
    totalKebutuhan: 0,
    totalEksisting: 0,
    updatedAt: new Date().toISOString(),
    lastExportedAt: null,
    ...partial,
  };
}

describe('computeTopLevel — double-count guard (M11.2, docs/14-recap-dashboard.md §2)', () => {
  it('Dinkes + 3 Puskesmas fixture: government total counts each linked project exactly once (exit criteria)', () => {
    const entries = [
      entry({ id: 'dinkes', kodeOPD: 'DINKES', totalKebutuhan: 500, totalEksisting: 420, linkedCodes: ['PKM1', 'PKM2', 'PKM3'] }),
      entry({ id: 'pkm1', kodeOPD: 'PKM1', totalKebutuhan: 40, totalEksisting: 35 }),
      entry({ id: 'pkm2', kodeOPD: 'PKM2', totalKebutuhan: 38, totalEksisting: 30 }),
      entry({ id: 'pkm3', kodeOPD: 'PKM3', totalKebutuhan: 45, totalEksisting: 40 }),
    ];

    const { topLevel, linkedUnder, doubleLinked } = computeTopLevel(entries);

    // Hanya Dinkes yang top-level — 3 Puskesmas ter-nest di bawahnya.
    expect(topLevel.map(e => e.id)).toEqual(['dinkes']);
    expect(linkedUnder.get('dinkes')).toEqual(['pkm1', 'pkm2', 'pkm3']);
    expect(doubleLinked).toEqual([]);

    // DINKES.totalKebutuhan (500) SUDAH menyertakan kontribusi Puskesmas lewat
    // resolusi link di buildIndexEntry (M11.1/M11.2 prasyarat) — headline
    // pemerintah cukup jumlah topLevel saja, TIDAK dijumlah lagi dengan PKM*.
    const totals = sumTopLevelTotals(topLevel);
    expect(totals.kebutuhan).toBe(500);
    expect(totals.eksisting).toBe(420);
  });

  it('a project not referenced by any linkedCodes is top-level on its own', () => {
    const entries = [
      entry({ id: 'a', kodeOPD: 'A', totalKebutuhan: 10, totalEksisting: 8 }),
      entry({ id: 'b', kodeOPD: 'B', totalKebutuhan: 20, totalEksisting: 15 }),
    ];
    const { topLevel } = computeTopLevel(entries);
    expect(topLevel.map(e => e.id).sort()).toEqual(['a', 'b']);
  });

  it('DASH_DOUBLE_LINKED: a project referenced by two different parents is flagged and counted once under the first', () => {
    const entries = [
      entry({ id: 'p1', kodeOPD: 'P1', linkedCodes: ['SHARED'] }),
      entry({ id: 'p2', kodeOPD: 'P2', linkedCodes: ['SHARED'] }),
      entry({ id: 'shared', kodeOPD: 'SHARED' }),
    ];
    const { topLevel, linkedUnder, doubleLinked } = computeTopLevel(entries);

    expect(topLevel.map(e => e.id).sort()).toEqual(['p1', 'p2']);
    expect(doubleLinked).toEqual([{ entryId: 'shared', parentIds: ['p1', 'p2'] }]);
    // Dihitung sekali di bawah parent pertama (p1) saja, bukan p2.
    expect(linkedUnder.get('p1')).toEqual(['shared']);
    expect(linkedUnder.get('p2')).toBeUndefined();
  });

  it('a link whose kodeOPD is not resolvable in storage does not count as a parent-child pair', () => {
    const entries = [entry({ id: 'a', kodeOPD: 'A', linkedCodes: ['BELUM-ADA'] })];
    const { topLevel, doubleLinked } = computeTopLevel(entries);
    expect(topLevel.map(e => e.id)).toEqual(['a']); // unresolved -> tidak menghilangkan siapa pun dari topLevel
    expect(doubleLinked).toEqual([]);
  });

  it('a self-referencing linkedCodes entry (data corruption) is ignored, not treated as its own child', () => {
    const entries = [entry({ id: 'a', kodeOPD: 'A', linkedCodes: ['A'] })];
    const { topLevel } = computeTopLevel(entries);
    expect(topLevel.map(e => e.id)).toEqual(['a']);
  });
});

describe('isEntryStale (docs/14 §3)', () => {
  it('flags an imported entry older than 30 days as stale', () => {
    const old = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
    expect(isEntryStale(entry({ id: 'a', kodeOPD: 'A', origin: 'imported', updatedAt: old }))).toBe(true);
  });

  it('does not flag a fresh imported entry as stale', () => {
    expect(isEntryStale(entry({ id: 'a', kodeOPD: 'A', origin: 'imported' }))).toBe(false);
  });

  it('never flags a "created" (own) entry as stale regardless of age', () => {
    const old = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString();
    expect(isEntryStale(entry({ id: 'a', kodeOPD: 'A', origin: 'created', updatedAt: old }))).toBe(false);
  });
});

describe('buildDashboardCards (M11.3, docs/14-recap-dashboard.md §1 & §3 — revisi: tanpa kartu placeholder)', () => {
  const testOpdList: OpdEntry[] = [
    { kode: 'DINKES', nama: 'Dinas Kesehatan', kelompok: 'Dinas' },
    { kode: 'DISHUB', nama: 'Dinas Perhubungan', kelompok: 'Dinas' },
    { kode: 'DISKOMINFOTIK', nama: 'Dinas Kominfo', kelompok: 'Dinas', alias: ['DISKOMINFO'] },
  ];
  const opdIndex = buildOpdIndex([], { listVersion: 'test', opd: testOpdList });

  it('produces no cards at all when no project is stored, regardless of the known OPD list', () => {
    const groups = buildDashboardCards([], new Map(), opdIndex);
    expect(groups.size).toBe(0);
  });

  it('an existing top-level entry gets a card grouped by its known kelompok', () => {
    const dinkesEntry = entry({ id: 'e-dinkes', kodeOPD: 'DINKES', totalKebutuhan: 100, totalEksisting: 90 });
    const groups = buildDashboardCards([dinkesEntry], new Map(), opdIndex);
    const dinasCards = groups.get('Dinas') ?? [];

    // Hanya project yang benar-benar tersimpan yang dapat kartu — tidak ada
    // kartu tambahan untuk DISHUB/DISKOMINFOTIK yang belum punya project.
    expect(dinasCards).toHaveLength(1);
    const dinkesCard = dinasCards[0];
    expect(dinkesCard.entry).toBe(dinkesEntry);
    expect(dinkesCard.isUnregistered).toBe(false);
  });

  it('a project matched via an alias code resolves to the canonical kelompok, not "Lainnya"', () => {
    const viaAlias = entry({ id: 'e-1', kodeOPD: 'DISKOMINFO', totalKebutuhan: 5, totalEksisting: 5 });
    const groups = buildDashboardCards([viaAlias], new Map(), opdIndex);
    const dinasCards = groups.get('Dinas') ?? [];

    expect(dinasCards).toHaveLength(1);
    const matched = dinasCards[0];
    expect(matched.kodeOPD).toBe('DISKOMINFO');
    expect(matched.entry).toBe(viaAlias);
    expect(matched.isUnregistered).toBe(false);
  });

  it('an unknown-code project groups under "Lainnya", nothing lost', () => {
    const unknown = entry({ id: 'e-x', kodeOPD: 'PKM-BARU', totalKebutuhan: 1, totalEksisting: 1 });
    const groups = buildDashboardCards([unknown], new Map(), opdIndex);
    const lainnya = groups.get(LAINNYA_KELOMPOK) ?? [];

    expect(lainnya).toHaveLength(1);
    expect(lainnya[0].entry).toBe(unknown);
    expect(lainnya[0].isUnregistered).toBe(true);
  });

  it('attaches linkedChildIds from computeTopLevel to the parent card', () => {
    const dinkesEntry = entry({ id: 'e-dinkes', kodeOPD: 'DINKES', linkedCodes: ['PKM1'] });
    const linkedUnder = new Map([['e-dinkes', ['pkm1-id']]]);
    const groups = buildDashboardCards([dinkesEntry], linkedUnder, opdIndex);
    const dinkesCard = (groups.get('Dinas') ?? []).find(c => c.kodeOPD === 'DINKES')!;
    expect(dinkesCard.linkedChildIds).toEqual(['pkm1-id']);
  });
});
