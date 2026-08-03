import { CustomValue } from './project';

export type NodeType = 'unit' | 'jabatan';
export type Rumpun = 'keahlian' | 'keterampilan';

export interface Rincian {
  id: string; // uuid
  jenjangId: string | null; // null for non-functional single row
  kebutuhan: number; // integer >= 0
  eksisting: number; // integer >= 0
}

export interface LinkRef {
  projectCode: string;
  projectName: string;
  cached: {
    totalKebutuhan: number;
    totalEksisting: number;
    nodeCount: number;
    updatedAt: string;
  };
}

export interface OrgNode {
  id: string; // uuid v4
  type: NodeType;

  // identity
  nama: string;
  nomor: string; // hierarchical, e.g. '1.2.1'
  kode?: string; // position code

  // classification — ids referencing taxonomy, not display labels
  kategoriId?: string; // undefined for type === 'unit'
  rumpun: Rumpun[]; // [] unless kategori is functional

  // figures
  rincian: Rincian[]; // ALWAYS [] when type === 'unit'

  // descriptive
  unitKerja?: string;
  keterangan?: string;
  custom: Record<string, CustomValue>;

  // multi-project layer (Stage B readiness; both optional)
  link?: LinkRef;
  isTemplate?: boolean;

  // presentation
  position: { x: number; y: number };
  collapsed: boolean;
}
