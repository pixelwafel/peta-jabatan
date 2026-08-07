import { RecapBucket } from '@/models/derived';

export interface ProjectIndexEntry {
  id: string;
  namaOPD: string;
  kodeOPD: string;
  nodeCount: number;
  totalKebutuhan: number;
  totalEksisting: number;
  updatedAt: string;
  lastExportedAt: string | null; // drives unsaved-work warning
  linkedCodes?: string[];
  origin?: 'created' | 'imported';
  /** docs/14-recap-dashboard.md §2 — badge "N file bermasalah" di dashboard
   * tanpa perlu membuka body project. `info` sengaja tidak dihitung (terlalu
   * banyak noise untuk sebuah badge ringkas). */
  findingCounts?: { errors: number; warnings: number };
}

export interface ProjectIndex {
  version: 1;
  activeId: string | null;
  entries: ProjectIndexEntry[];
}

/**
 * Fase 3.1 (docs/20-skalabilitas-worker-virtualisasi.md §3.1) — ringkasan
 * kecil di samping body project, ditulis tiap kali `saveProject` berhasil.
 * Tujuannya supaya `computeGlobalBreakdown` (dashboard rekap se-pemda) bisa
 * fold atas N record ~1KB ini alih-alih membaca N body project penuh — biaya
 * dashboard jadi O(jumlah OPD), bukan O(total node se-pemda).
 *
 * `computedFrom` adalah kunci freshness: harus SAMA PERSIS dengan
 * `ProjectIndexEntry.updatedAt` project yang bersangkutan supaya dianggap
 * segar (lihat isProjectSummaryFresh di persistence/storage.ts). Perbandingan
 * ini sengaja dilakukan terhadap `ProjectIndexEntry` yang SUDAH ada di memori
 * (bagian dari `ProjectIndex` yang sudah dimuat), BUKAN dengan membuka body
 * project — itu akan meniadakan tujuan summary ini sama sekali.
 */
export interface ProjectSummary {
  schemaVersion: 2;
  computedFrom: string; // == ProjectIndexEntry.updatedAt saat summary ini dihitung
  total: RecapBucket;
  perKategori: RecapBucket[];
  perJenjang: RecapBucket[];
  unplaced: RecapBucket;
  nodeCount: number;
  findingCounts: { errors: number; warnings: number };
  linkedCodes: string[];
}
