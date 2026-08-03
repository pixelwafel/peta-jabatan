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

export interface UnitInstance {
  instanceId: string;
  instanceName: string;
  figures: Record<string, { kebutuhan: number; eksisting: number }>;
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
