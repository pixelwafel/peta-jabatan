import rawDaftarOpd from './daftar-opd.json';

export interface OpdEntry {
  kode: string;
  nama: string;
  kelompok: string;
  /** Kode historis (mis. OPD berganti nama/kode) — dipetakan ke `kode` saat ini. */
  alias?: string[];
}

export interface DaftarOpd {
  listVersion: string;
  opd: OpdEntry[];
}

/** Daftar OPD bawaan aplikasi (docs/14-recap-dashboard.md §1) — dibundel seperti taxonomy. */
export const daftarOpdBawaan: DaftarOpd = Object.freeze(rawDaftarOpd as DaftarOpd);

/**
 * Gabungkan daftar bawaan dengan entri kustom operator (§1.1) menjadi satu peta
 * kode->entry, sudah termasuk resolusi alias. Dipakai baik oleh dashboard
 * (grouping & placeholder) maupun project manager (grouping).
 */
export function buildOpdIndex(
  custom: OpdEntry[] = [],
  base: DaftarOpd = daftarOpdBawaan
): Map<string, OpdEntry> {
  const byKode = new Map<string, OpdEntry>();

  for (const entry of [...base.opd, ...custom]) {
    byKode.set(entry.kode, entry);
    for (const alias of entry.alias ?? []) {
      byKode.set(alias, entry);
    }
  }

  return byKode;
}

/** Cari entry OPD untuk sebuah kodeOPD, termasuk lewat alias historis. */
export function resolveOpdEntry(
  kodeOPD: string,
  opdIndex: Map<string, OpdEntry>
): OpdEntry | undefined {
  return opdIndex.get(kodeOPD);
}
