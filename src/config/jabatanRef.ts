import { Rumpun } from '@/models/node';

export type KlasifikasiPelaksana = 'Klerek' | 'Operator' | 'Teknisi';

export interface JabatanRefEntry {
  nama: string;
  kategoriId: 'fungsional' | 'pelaksana';
  /** Hanya untuk kategoriId 'fungsional'. */
  rumpun?: Rumpun;
  /** Hanya untuk kategoriId 'pelaksana'. */
  klasifikasiPelaksana?: KlasifikasiPelaksana;
  deskripsi?: string;
  instansi?: string;
}

interface KamusJfRow {
  nama_jabatan: string;
  kualifikasi_pendidikan?: string;
  kategori: string; // "Keahlian" | "Keterampilan" | typo "Ketrampilan"
  rumpun_jabatan?: string;
  instansi_pembina?: string;
}

interface PelaksanaRow {
  nomenklatur: string;
  tugas_jabatan?: string;
  instansi_teknis?: string | null;
}

function normalizeRumpunJf(raw: string): Rumpun {
  // Sumber Kepmenpan RB memuat variasi ejaan ("Keterampilan" vs "Ketrampilan").
  return raw.trim().toLowerCase().startsWith('keahli') ? 'keahlian' : 'keterampilan';
}

function fromJf(rows: KamusJfRow[]): JabatanRefEntry[] {
  return rows.map(row => ({
    nama: row.nama_jabatan,
    kategoriId: 'fungsional',
    rumpun: normalizeRumpunJf(row.kategori),
    deskripsi: row.kualifikasi_pendidikan,
    instansi: row.instansi_pembina,
  }));
}

function fromPelaksana(rows: PelaksanaRow[], klasifikasi: KlasifikasiPelaksana): JabatanRefEntry[] {
  return rows.map(row => ({
    nama: row.nomenklatur,
    kategoriId: 'pelaksana',
    klasifikasiPelaksana: klasifikasi,
    deskripsi: row.tugas_jabatan,
    instansi: row.instansi_teknis ?? undefined,
  }));
}

export interface JabatanRefData {
  entries: JabatanRefEntry[];
  /** Array paralel nama-lowercase, index-selaras dengan `entries` — lihat
   * catatan performa di searchJabatanRef di bawah. */
  lowerNames: string[];
}

// Fase 1.8 — daftar referensi (Jabatan Fungsional dari kamus-jf, dan Jabatan
// Pelaksana klasifikasi Klerek/Operator/Teknisi — Kepmenpan RB No. 11 Tahun
// 2024; ~561 entri, JSON sumbernya 6.669 baris) dulu STATIC import dan
// diproses (map + sort) saat MODULE LOAD, jadi ikut masuk entry chunk dan
// ikut kerja setiap kali app dibuka meski operator belum pernah membuka
// field nama jabatan sama sekali. Sekarang lewat loadJabatanRef(): dynamic
// import (Vite otomatis code-split file JSON-nya jadi chunk terpisah),
// hanya dipanggil oleh JabatanNameField.tsx saat field itu benar-benar
// difokus pertama kali, dan hasilnya di-cache satu Promise modul-level
// supaya panggilan berikutnya (field lain, node lain) tidak memproses ulang.
let cachedRefPromise: Promise<JabatanRefData> | null = null;

export function loadJabatanRef(): Promise<JabatanRefData> {
  if (!cachedRefPromise) {
    cachedRefPromise = (async () => {
      const [kamusJf, pelaksanaKlerek, pelaksanaOperator, pelaksanaTeknisi] = await Promise.all([
        import('./ref-jab/kamus-jf.json'),
        import('./ref-jab/jab_pelaksana_klerek.json'),
        import('./ref-jab/jab_pelaksana_operator.json'),
        import('./ref-jab/jab_pelaksana_teknisi.json'),
      ]);

      const entries: JabatanRefEntry[] = [
        ...fromJf(kamusJf.default as unknown as KamusJfRow[]),
        ...fromPelaksana(
          (pelaksanaKlerek.default as unknown as { data_jabatan: PelaksanaRow[] }).data_jabatan,
          'Klerek'
        ),
        ...fromPelaksana(pelaksanaOperator.default as unknown as PelaksanaRow[], 'Operator'),
        ...fromPelaksana(
          (pelaksanaTeknisi.default as unknown as { data: PelaksanaRow[] }).data,
          'Teknisi'
        ),
      ].sort((a, b) => a.nama.localeCompare(b.nama, 'id'));

      // Array paralel nama-lowercase dibangun sekali di sini (Fase 1.7) — lihat
      // catatan di searchJabatanRef.
      const lowerNames = entries.map(e => e.nama.toLowerCase());

      return { entries, lowerNames };
    })();
  }
  return cachedRefPromise;
}

/**
 * Cari entri referensi berdasar substring nama (case-insensitive). Hasil yang
 * diawali query naik ke atas, sisanya (match di tengah kata) mengikuti.
 * Menerima `JabatanRefData` (hasil loadJabatanRef()) alih-alih membaca dari
 * module-level state — pemanggil (JabatanNameField) menyimpan hasil
 * loadJabatanRef() sekali di state komponennya lalu memanggil ini berulang.
 */
export function searchJabatanRef(ref: JabatanRefData, query: string, limit = 40): JabatanRefEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const startsWith: JabatanRefEntry[] = [];
  const contains: JabatanRefEntry[] = [];

  for (let i = 0; i < ref.entries.length; i++) {
    const nama = ref.lowerNames[i];
    if (nama.startsWith(q)) {
      startsWith.push(ref.entries[i]);
    } else if (nama.includes(q)) {
      contains.push(ref.entries[i]);
    }
  }

  return [...startsWith, ...contains].slice(0, limit);
}
