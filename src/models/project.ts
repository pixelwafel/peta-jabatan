import { OrgNode } from './node';
import { OrgEdge } from './edge';

export type AttrType = 'text' | 'number' | 'dropdown' | 'boolean' | 'date' | 'multiline';
export type CustomValue = string | number | boolean | null;

export interface CustomAttribute {
  id: string; // slug, stable
  nama: string; // display label
  tipe: AttrType;
  opsi?: string[]; // dropdown only
  wajib?: boolean; // soft-required
}

export interface ProjectMeta {
  namaOPD: string;
  kodeOPD: string;
  penyusun: string;
  tahunAnggaran?: string;
  keterangan?: string;
}

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

/**
 * Satu baris "satuan" (docs/15-template-instance.md §1) — SDN 01, SDN 02, dst
 * — di bawah SATU unit template. `templateNodeId` wajib ada supaya sebuah
 * project bisa punya lebih dari satu template unit (SD & SMP berdampingan,
 * doc 15 §6) tanpa instance-nya tercampur.
 */
export interface UnitInstance {
  id: string; // uuid
  templateNodeId: string; // OrgNode.id milik unit ber-isTemplate:true
  nama: string; // 'SDN 01 Kota Timur'
  kode?: string; // NPSN atau kode lokal lain
  figures: Record<string /* rincianId */, { kebutuhan: number; eksisting: number }>;
  keterangan?: string;
}

export interface Project {
  id: string;
  schemaVersion: string; // e.g. '1.0.0'
  configVersion: string; // e.g. '2026.1'
  meta: ProjectMeta;
  attributeSchema: CustomAttribute[];
  nodes: OrgNode[];
  edges: OrgEdge[];
  instances?: UnitInstance[];
  viewport: Viewport;
  createdAt: string; // ISO 8601
  updatedAt: string;
}
