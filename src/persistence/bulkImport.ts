import { get, set, del } from 'idb-keyval';
import { customStore, getProjectKey, getProjectIndex, saveProjectIndex, buildIndexEntry } from './storage';
import { Project } from '@/models/project';

const ARCHIVE_PREFIX = 'pjb:v1:archive:';

/**
 * Arsip satu generasi (docs/14-recap-dashboard.md §4/§4.1): sebelum project
 * `id` ditimpa oleh hasil "replace", body lama disalin ke kunci arsip.
 * Menimpa arsip sebelumnya (kalau ada) — cuma satu generasi disimpan, bukan
 * riwayat penuh, supaya biayanya tetap satu kunci per project.
 */
export async function archiveProject(id: string): Promise<void> {
  const body = await get<Project>(getProjectKey(id), customStore);
  if (body) {
    await set(`${ARCHIVE_PREFIX}${id}`, body, customStore);
  }
}

export async function getArchivedProject(id: string): Promise<Project | null> {
  return (await get<Project>(`${ARCHIVE_PREFIX}${id}`, customStore)) ?? null;
}

export interface BulkCommitItem {
  /** Project yang akan ditulis. `id` sudah disesuaikan ke `existingId` di
   * pemanggil kalau ini menimpa project tersimpan (status 'replace'). */
  project: Project;
  /** true kalau ini menimpa project tersimpan — memicu archiveProject() dulu. */
  isReplace: boolean;
}

export interface BulkCommitResult {
  /** Kunci IndexedDB yang berhasil ditulis di Fase 1 — dipakai rollbackBulkImport(). */
  writtenKeys: string[];
  committedProjects: Project[];
  /** namaOPD/fileName project yang gagal ditulis (error storage per-item, bukan fatal). */
  failed: Array<{ project: Project; error: string }>;
}

/**
 * Two-Phase Commit (docs/14-recap-dashboard.md §4.1):
 * Fase 1 — tulis semua body project ke IndexedDB, arsipkan dulu yang
 * di-replace, catat kunci yang berhasil ditulis.
 * Fase 2 — SETELAH semua body berhasil, perbarui index (pjb:v1:index) dalam
 * satu operasi baca-ubah-tulis. Kalau Fase 1 gagal sebagian, panggilan ini
 * TIDAK menyentuh index sama sekali untuk item yang gagal — pemanggil
 * (UI) yang memutuskan rollback (`rollbackBulkImport`) atau lanjut dengan
 * yang berhasil saja.
 */
export async function commitBulkImport(items: BulkCommitItem[]): Promise<BulkCommitResult> {
  const writtenKeys: string[] = [];
  const committedProjects: Project[] = [];
  const failed: BulkCommitResult['failed'] = [];

  // Fase 1: staging & body writes
  for (const item of items) {
    try {
      if (item.isReplace) {
        await archiveProject(item.project.id); // arsip SEBELUM ditimpa (§4.1 poin 3)
      }
      const key = getProjectKey(item.project.id);
      await set(key, item.project, customStore);
      writtenKeys.push(key);
      committedProjects.push(item.project);
    } catch (err) {
      failed.push({ project: item.project, error: err instanceof Error ? err.message : String(err) });
    }
  }

  // Fase 2: index commit atomik — hanya untuk project yang berhasil di Fase 1
  if (committedProjects.length > 0) {
    const index = await getProjectIndex();

    for (const project of committedProjects) {
      const existingEntry = index.entries.find(e => e.id === project.id);
      const entry = await buildIndexEntry(
        project,
        { lastExportedAt: existingEntry?.lastExportedAt ?? null, origin: 'imported' },
        index
      );
      const idx = index.entries.findIndex(e => e.id === project.id);
      if (idx >= 0) index.entries[idx] = entry;
      else index.entries.push(entry);
    }

    await saveProjectIndex(index);
  }

  return { writtenKeys, committedProjects, failed };
}

/**
 * Rollback (§4.1 poin 2, "Batalkan Semua"): hapus kunci-kunci yang sudah
 * ditulis di Fase 1. Index TIDAK pernah tersentuh untuk batch ini (Fase 2
 * belum jalan kalau operator memilih rollback sebelum konfirmasi), jadi
 * cukup hapus body-nya saja.
 */
export async function rollbackBulkImport(writtenKeys: string[]): Promise<void> {
  for (const key of writtenKeys) {
    await del(key, customStore);
  }
}
