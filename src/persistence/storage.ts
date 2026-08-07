import { set, del, keys, createStore } from 'idb-keyval';
import { Project } from '@/models/project';
import { ProjectIndex, ProjectSummary } from './types';
import { repository } from './repository';

// Fase 3.2 (docs/20-skalabilitas-worker-virtualisasi.md §3.2) — permukaan
// publik dari file ini TIDAK BERUBAH lewat migrasi ini (nama & signature
// fungsi di bawah sama persis seperti sebelum Fase 3.2); isinya sekarang
// tinggal delegasi tipis ke `repository` (persistence/repository.ts, skema
// idb sungguhan di persistence/db.ts). TIDAK SATU PUN call site di luar
// persistence/ yang perlu berubah — bootstrap.ts, autosave.ts, kedua Zustand
// store, semua komponen, workers/analysis.worker.ts, tests — semuanya lewat
// fungsi-fungsi ini persis seperti sebelumnya.
export { buildIndexEntry, buildProjectSummary, isProjectSummaryFresh, normalizeProject } from './projectBuilders';

// `pjb_db` (idb-keyval) TETAP hidup — dipakai untuk data yang BUKAN bagian
// dari masalah skala yang Fase 3.2 selesaikan (daftar OPD kustom, arsip
// satu-generasi bulk import — lihat persistence/customOpd.ts &
// persistence/bulkImport.ts) dan sebagai SUMBER migrasi satu-kali
// (persistence/migrateV2.ts) untuk instalasi yang masih punya data lama. Body
// project + index entry + ringkasan sekarang hidup di database idb TERPISAH
// (persistence/db.ts, `pjb_v2`) lewat `repository` di atas — lihat catatan
// "kenapa database terpisah" di persistence/db.ts.
export const customStore = createStore('pjb_db', 'pjb_store');

const PROJECT_PREFIX = 'pjb:v1:project:';
const SUMMARY_PREFIX = 'pjb:v2:summary:';
const INDEX_KEY = 'pjb:v1:index';

/** Dipakai migrateV2.ts (baca record lama) — jalur tulis normal sekarang
 * lewat `repository`, tidak lagi lewat key string ini. */
export function getProjectKey(id: string): string {
  return `${PROJECT_PREFIX}${id}`;
}

/** Dipakai migrateV2.ts (baca record lama, Fase 3.1 sempat menulis di sini
 * sebelum Fase 3.2 pindah ke `pjb_v2`). */
export function getProjectSummaryKey(id: string): string {
  return `${SUMMARY_PREFIX}${id}`;
}

/** Dipakai migrateV2.ts. */
export function getLegacyProjectIndexKey(): string {
  return INDEX_KEY;
}

/** Dipakai migrateV2.ts — daftar id project di skema LAMA (`pjb_db`,
 * idb-keyval), dienumerasi lewat `keys()`+filter prefix (sama seperti
 * `rebuildIndexFromStorage` versi Fase 2.3, sebelum pindah ke cursor idb
 * sungguhan di repository.ts — di sini cukup, cuma dipakai sekali seumur
 * migrasi). */
export async function listLegacyProjectIds(): Promise<string[]> {
  const allKeys = (await keys(customStore)) as string[];
  return allKeys
    .filter(k => typeof k === 'string' && k.startsWith(PROJECT_PREFIX))
    .map(k => k.slice(PROJECT_PREFIX.length));
}

export async function isIndexedDbAvailable(): Promise<boolean> {
  try {
    if (typeof indexedDB === 'undefined') return false;
    const testKey = 'pjb:test:probe';
    await set(testKey, '1', customStore);
    await del(testKey, customStore);
    return true;
  } catch {
    return false;
  }
}

export async function getProjectIndex(): Promise<ProjectIndex> {
  return repository.getProjectIndex();
}

export async function saveProjectIndex(index: ProjectIndex): Promise<void> {
  return repository.saveProjectIndex(index);
}

export async function getProject(id: string): Promise<Project | null> {
  return repository.getProject(id);
}

/**
 * Sama seperti getProject, tapi juga melaporkan apakah body dimigrasi (order
 * backfill dan/atau merge kepala struktural) selama pemuatan — dipakai
 * bootstrap.ts (Fase 1.1) supaya body yang berubah karena migrasi tetap
 * ditulis sekali, sementara body yang TIDAK berubah tidak memicu autosave
 * saat project cuma dibuka/dibaca.
 */
export async function getProjectWithMigrationFlag(
  id: string
): Promise<{ project: Project; migrated: boolean } | null> {
  return repository.getProjectWithMigrationFlag(id);
}

/** Fase 3.1 — baca ringkasan tersimpan. `null` kalau belum pernah ditulis
 * ATAU rusak/tidak terbaca — caller SELALU harus punya jalur fallback (baca
 * body + hitung langsung), lihat pemakainya di selectors/globalBreakdown.ts. */
export async function getProjectSummary(id: string): Promise<ProjectSummary | null> {
  return repository.getProjectSummary(id);
}

export async function saveProject(project: Project): Promise<void> {
  return repository.saveProject(project);
}

export async function deleteProjectData(id: string): Promise<void> {
  return repository.deleteProjectData(id);
}

export async function rebuildIndexFromStorage(): Promise<ProjectIndex> {
  return repository.rebuildIndexFromStorage();
}

export async function estimateStorageUsage(): Promise<{
  usedBytes: number;
  quotaBytes: number;
  percentUsed: number;
}> {
  return repository.estimateStorageUsage();
}
