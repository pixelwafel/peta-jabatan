import kamusJf from './ref-jab/kamus-jf.json';
import pelaksanaKlerek from './ref-jab/jab_pelaksana_klerek.json';
import pelaksanaOperator from './ref-jab/jab_pelaksana_operator.json';
import pelaksanaTeknisi from './ref-jab/jab_pelaksana_teknisi.json';
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

const fromJf: JabatanRefEntry[] = (kamusJf as KamusJfRow[]).map(row => ({
  nama: row.nama_jabatan,
  kategoriId: 'fungsional',
  rumpun: normalizeRumpunJf(row.kategori),
  deskripsi: row.kualifikasi_pendidikan,
  instansi: row.instansi_pembina,
}));

function fromPelaksana(rows: PelaksanaRow[], klasifikasi: KlasifikasiPelaksana): JabatanRefEntry[] {
  return rows.map(row => ({
    nama: row.nomenklatur,
    kategoriId: 'pelaksana',
    klasifikasiPelaksana: klasifikasi,
    deskripsi: row.tugas_jabatan,
    instansi: row.instansi_teknis ?? undefined,
  }));
}

/**
 * Daftar nomenklatur jabatan resmi (Jabatan Fungsional dari kamus-jf, dan
 * Jabatan Pelaksana klasifikasi Klerek/Operator/Teknisi — Kepmenpan RB No. 11
 * Tahun 2024) dipakai sebagai referensi saat operator mengisi nama jabatan.
 * Bukan daftar tertutup — nama di luar daftar ini tetap bisa diketik bebas,
 * lihat `components/property/JabatanNameField.tsx`.
 */
export const JABATAN_REF: JabatanRefEntry[] = [
  ...fromJf,
  ...fromPelaksana((pelaksanaKlerek as { data_jabatan: PelaksanaRow[] }).data_jabatan, 'Klerek'),
  ...fromPelaksana(pelaksanaOperator as PelaksanaRow[], 'Operator'),
  ...fromPelaksana((pelaksanaTeknisi as { data: PelaksanaRow[] }).data, 'Teknisi'),
].sort((a, b) => a.nama.localeCompare(b.nama, 'id'));

/**
 * Cari entri referensi berdasar substring nama (case-insensitive). Hasil yang
 * diawali query naik ke atas, sisanya (match di tengah kata) mengikuti.
 */
export function searchJabatanRef(query: string, limit = 40): JabatanRefEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const startsWith: JabatanRefEntry[] = [];
  const contains: JabatanRefEntry[] = [];

  for (const entry of JABATAN_REF) {
    const nama = entry.nama.toLowerCase();
    if (nama.startsWith(q)) {
      startsWith.push(entry);
    } else if (nama.includes(q)) {
      contains.push(entry);
    }
  }

  return [...startsWith, ...contains].slice(0, limit);
}
