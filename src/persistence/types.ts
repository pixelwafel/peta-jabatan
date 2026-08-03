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
}

export interface ProjectIndex {
  version: 1;
  activeId: string | null;
  entries: ProjectIndexEntry[];
}
