import { Project } from '@/models/project';
import { Taxonomy } from '@/config/taxonomy';
import { ProjectIndex, ProjectIndexEntry } from '@/persistence/types';

/**
 * Fase 2.2 — kontrak pesan antara workers/client.ts (main thread) dan
 * workers/analysis.worker.ts. Hanya tipe (dihapus saat compile), jadi file
 * ini boleh diimpor dua arah tanpa menambah siklus runtime.
 *
 * Semua payload adalah data biasa (structured-cloneable) — lihat catatan
 * "batas worker" di rencana Fase 2.2: Project/ProjectIndex/Recap/Finding[]
 * semuanya JSON biasa, Recap.nodeTotals/subtreeTotals berupa Map (juga
 * structured-cloneable).
 */

export interface ValidateRequest {
  op: 'validate';
  id: number;
  project: Project;
  cfg: Taxonomy;
  index: ProjectIndex;
}

export interface RecapRequest {
  op: 'recap';
  id: number;
  project: Project;
  cfg: Taxonomy;
  index: ProjectIndex;
}

export interface IndexEntryRequest {
  op: 'indexEntry';
  id: number;
  project: Project;
  carry: Pick<ProjectIndexEntry, 'lastExportedAt' | 'origin'>;
  index: ProjectIndex;
}

export interface GlobalBreakdownRequest {
  op: 'globalBreakdown';
  id: number;
  topLevel: ProjectIndexEntry[];
}

export interface CancelRequest {
  op: 'cancel';
  id: number;
}

export type WorkerRequest =
  | ValidateRequest
  | RecapRequest
  | IndexEntryRequest
  | GlobalBreakdownRequest
  | CancelRequest;

export interface ProgressResponse {
  id: number;
  type: 'progress';
  done: number;
  total: number;
}

export interface ResultResponse {
  id: number;
  type: 'result';
  result: unknown;
}

export interface ErrorResponse {
  id: number;
  type: 'error';
  message: string;
}

export type WorkerResponse = ProgressResponse | ResultResponse | ErrorResponse;
