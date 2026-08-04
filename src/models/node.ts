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

/**
 * Posisi kepala unit (kategori struktural) melekat langsung pada node Unit —
 * BUKAN node Jabatan terpisah. Node Jabatan hanya dipakai untuk Fungsional
 * & Pelaksana. kategoriId tersirat 'struktural', tidak disimpan berulang.
 */
export interface KepalaUnit {
  nama?: string; // override label; default "Kepala {nama unit}" bila kosong
  kode?: string; // kode posisi kepala, terpisah dari kode unit sendiri
  jenjangId: string | null; // level struktural (mis. Administrator, Pengawas)
  kebutuhan: number; // integer >= 0
  eksisting: number; // integer >= 0
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
  kepalaUnit?: KepalaUnit; // ONLY meaningful when type === 'unit'; always undefined for 'jabatan'

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

  // ordering
  order: number; // urutan sibling, sumber kebenaran untuk sort & renumber

  // protection
  locked?: boolean; // kalau true, blokir edit/hapus/pindah pada node ini saja
  // (individual — tidak diwarisi dari/ke leluhur atau keturunan). Mengunci
  // sebuah Unit/OPD beserta seluruh cabangnya adalah aksi cascade terpisah
  // yang menulis field ini ke tiap descendant, lihat store/projectStore.ts
  // setLocked() dan selectors/guards.ts isLocked().
}
