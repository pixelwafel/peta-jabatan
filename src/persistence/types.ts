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
