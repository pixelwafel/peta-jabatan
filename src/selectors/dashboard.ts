import { ProjectIndexEntry } from '@/persistence/types';
import { NodeTotals } from '@/models/derived';
import { OpdEntry, resolveOpdEntry } from '@/config/daftarOpd';

export const LAINNYA_KELOMPOK = 'Lainnya';

export interface TopLevelResult {
  /** Entries yang dihitung di headline pemerintah (bukan child dari project lain). */
  topLevel: ProjectIndexEntry[];
  /** parentEntryId -> id project yang ditautkan di bawahnya (nested sub-card, doc 14 §3). */
  linkedUnder: Map<string, string[]>;
  /**
   * Project yang ditautkan oleh LEBIH DARI SATU parent — DASH_DOUBLE_LINKED
   * (doc 14 §2). Tetap dihitung sekali di bawah parent pertama supaya total
   * tidak berubah, tapi ditandai supaya operator bisa membereskannya.
   */
  doubleLinked: Array<{ entryId: string; parentIds: string[] }>;
}

/**
 * Double-count guard (docs/14-recap-dashboard.md §2): sebuah project yang
 * ditautkan (linkedCodes project lain menyebut kodeOPD-nya) TIDAK dihitung
 * lagi di headline — angkanya sudah ikut di total parent-nya lewat resolusi
 * link (docs/13 §3, sudah dibakukan ke ProjectIndexEntry.totalKebutuhan lewat
 * persistence/storage.ts buildIndexEntry). Cukup jumlahkan entries `topLevel`
 * untuk dapat total pemerintah yang benar, tanpa perlu buka body sama sekali.
 */
export function computeTopLevel(entries: ProjectIndexEntry[]): TopLevelResult {
  const idByKode = new Map<string, string>();
  for (const e of entries) idByKode.set(e.kodeOPD, e.id);

  // childEntryId -> [parentEntryId, ...] dalam urutan kemunculan
  const parentsOf = new Map<string, string[]>();
  for (const parent of entries) {
    for (const kode of parent.linkedCodes ?? []) {
      const childId = idByKode.get(kode);
      if (!childId || childId === parent.id) continue; // kode belum ada di storage, atau tautan ke diri sendiri
      const list = parentsOf.get(childId) ?? [];
      list.push(parent.id);
      parentsOf.set(childId, list);
    }
  }

  const doubleLinked = Array.from(parentsOf.entries())
    .filter(([, parents]) => parents.length > 1)
    .map(([entryId, parentIds]) => ({ entryId, parentIds }));

  const topLevel = entries.filter(e => !parentsOf.has(e.id));

  const linkedUnder = new Map<string, string[]>();
  for (const [childId, parentIds] of parentsOf.entries()) {
    // "counted once under the first" (doc 14 §2) — parent pertama yang
    // ditemukan menang, sisanya hanya tercatat di `doubleLinked`.
    const firstParent = parentIds[0];
    const list = linkedUnder.get(firstParent) ?? [];
    list.push(childId);
    linkedUnder.set(firstParent, list);
  }

  return { topLevel, linkedUnder, doubleLinked };
}

/** Jumlah headline pemerintah — sum topLevel saja (double-count guard). */
export function sumTopLevelTotals(topLevel: ProjectIndexEntry[]): NodeTotals {
  let kebutuhan = 0;
  let eksisting = 0;
  for (const e of topLevel) {
    kebutuhan += e.totalKebutuhan;
    eksisting += e.totalEksisting;
  }
  return { kebutuhan, eksisting, selisih: eksisting - kebutuhan };
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Staleness dashboard (doc 14 §3): `updatedAt` lebih dari 30 hari untuk file
 * `origin: 'imported'` — file operator sendiri (`created`) dianggap selalu
 * "current" karena disimpan di browser yang sama yang sedang membuka dashboard.
 */
export function isEntryStale(entry: ProjectIndexEntry): boolean {
  if (entry.origin !== 'imported') return false;
  return Date.now() - Date.parse(entry.updatedAt) > THIRTY_DAYS_MS;
}

export interface DashboardCard {
  kodeOPD: string;
  namaOPD: string;
  kelompok: string;
  /** null = placeholder — OPD diharapkan (ada di daftar) tapi belum ada project-nya. */
  entry: ProjectIndexEntry | null;
  /** Project id yang ditautkan di bawah card ini (nested sub-card, doc 14 §3). */
  linkedChildIds: string[];
  /** kodeOPD project ini tidak ditemukan di daftar bawaan+kustom -> masuk "Lainnya". */
  isUnregistered: boolean;
}

/**
 * Susun kartu dashboard per kelompok (docs/14-recap-dashboard.md §1, §3):
 * - Tiap entry top-level (hasil computeTopLevel) jadi satu kartu, dikelompokkan
 *   lewat daftar OPD (bawaan+kustom, alias-aware); tak ditemukan -> "Lainnya".
 * - OPD yang ada di daftar tapi TIDAK punya project tersimpan (cocok kodeOPD-nya)
 *   dapat kartu placeholder ("belum masuk"), supaya absensi kelihatan (doc 14 §1).
 * - Murni dari index — tidak membuka body project mana pun (doc 14 §2).
 */
export function buildDashboardCards(
  topLevel: ProjectIndexEntry[],
  linkedUnder: Map<string, string[]>,
  opdIndex: Map<string, OpdEntry>
): Map<string, DashboardCard[]> {
  const groups = new Map<string, DashboardCard[]>();
  const matchedKodes = new Set<string>();

  const pushCard = (kelompok: string, card: DashboardCard) => {
    const list = groups.get(kelompok) ?? [];
    list.push(card);
    groups.set(kelompok, list);
  };

  for (const e of topLevel) {
    const opd = resolveOpdEntry(e.kodeOPD, opdIndex);
    const kelompok = opd?.kelompok ?? LAINNYA_KELOMPOK;
    if (opd) matchedKodes.add(opd.kode);

    pushCard(kelompok, {
      kodeOPD: e.kodeOPD,
      namaOPD: e.namaOPD,
      kelompok,
      entry: e,
      linkedChildIds: linkedUnder.get(e.id) ?? [],
      isUnregistered: !opd,
    });
  }

  // Placeholder untuk OPD yang diharapkan (daftar bawaan+kustom) tapi belum
  // ada project-nya sama sekali. `opdIndex` juga berisi alias sebagai key
  // terpisah menunjuk entry yang sama — proses tiap entry kanonis sekali saja.
  const seenCanonical = new Set<OpdEntry>();
  for (const opd of opdIndex.values()) {
    if (seenCanonical.has(opd)) continue;
    seenCanonical.add(opd);
    if (matchedKodes.has(opd.kode)) continue;

    pushCard(opd.kelompok, {
      kodeOPD: opd.kode,
      namaOPD: opd.nama,
      kelompok: opd.kelompok,
      entry: null,
      linkedChildIds: [],
      isUnregistered: false,
    });
  }

  return groups;
}
