import { get, set } from 'idb-keyval';
import { customStore } from './storage';
import { repository } from './repository';
import { Project } from '@/models/project';

const ARCHIVE_PREFIX = 'pjb:v1:archive:';

/**
 * Arsip satu generasi (docs/14-recap-dashboard.md §4/§4.1): sebelum project
 * `id` ditimpa oleh hasil "replace", body lama disalin ke kunci arsip.
 * Menimpa arsip sebelumnya (kalau ada) — cuma satu generasi disimpan, bukan
 * riwayat penuh, supaya biayanya tetap satu kunci per project.
 *
 * Fase 3.2 — body SUMBER dibaca dari `repository` (database `pjb_v2`, lihat
 * persistence/db.ts), tapi SALINAN arsipnya sendiri TETAP disimpan di
 * `pjb_db` lama (idb-keyval) — arsip bukan bagian dari masalah skala yang
 * Fase 3.2 selesaikan (satu generasi per project, bukan data yang tumbuh
 * dengan jumlah OPD), jadi sengaja tidak dipindah. Lihat "batas migrasi" di
 * docs/20-skalabilitas-worker-virtualisasi.md §3.2.
 */
export async function archiveProject(id: string): Promise<void> {
  const body = await repository.getProject(id);
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
  /** Id project yang berhasil ditulis di Fase 1 — dipakai rollbackBulkImport().
   * Fase 3.2: dulu ini kunci string idb-keyval (`pjb:v1:project:<id>`),
   * sekarang id polos (repository/db.ts pakai id sebagai key langsung). */
  writtenIds: string[];
  committedProjects: Project[];
  /** namaOPD/fileName project yang gagal ditulis (error storage per-item, bukan fatal). */
  failed: Array<{ project: Project; error: string }>;
}

/**
 * Two-Phase Commit (docs/14-recap-dashboard.md §4.1):
 * Fase 1 — tulis semua body project (`repository.putProjectBody`, TIDAK
 * menyentuh entry/summary/activeId), arsipkan dulu yang di-replace, catat id
 * yang berhasil ditulis.
 * Fase 2 — SETELAH semua body berhasil, tulis entry+summary untuk seluruh
 * batch dalam SATU transaksi (`repository.writeEntriesAndSummaries` — Fase
 * 3.2, dulu baca-ubah-tulis SELURUH `ProjectIndex` di sini). Kalau Fase 1
 * gagal sebagian, panggilan ini TIDAK menyentuh entry/summary sama sekali
 * untuk item yang gagal — pemanggil (UI) yang memutuskan rollback
 * (`rollbackBulkImport`) atau lanjut dengan yang berhasil saja. `activeId`
 * TIDAK PERNAH disentuh fungsi ini — batch import tidak membuat satu pun
 * project di dalamnya otomatis jadi aktif (perilaku dipertahankan persis
 * dari sebelum Fase 3.2).
 */
export async function commitBulkImport(items: BulkCommitItem[]): Promise<BulkCommitResult> {
  const writtenIds: string[] = [];
  const committedProjects: Project[] = [];
  const failed: BulkCommitResult['failed'] = [];

  // Fase 1: staging & body writes
  for (const item of items) {
    try {
      if (item.isReplace) {
        await archiveProject(item.project.id); // arsip SEBELUM ditimpa (§4.1 poin 3)
      }
      await repository.putProjectBody(item.project);
      writtenIds.push(item.project.id);
      committedProjects.push(item.project);
    } catch (err) {
      failed.push({ project: item.project, error: err instanceof Error ? err.message : String(err) });
    }
  }

  // Fase 2: entry+summary commit atomik — hanya untuk project yang berhasil di
  // Fase 1. `lastExportedAt` dipertahankan dari entry LAMA kalau ini
  // menimpa project tersimpan (status 'replace') — dibaca dari index
  // SEBELUM batch ini, persis perilaku sebelum Fase 3.2.
  if (committedProjects.length > 0) {
    const currentIndex = await repository.getProjectIndex();
    const items = committedProjects.map(project => {
      const existingEntry = currentIndex.entries.find(e => e.id === project.id);
      return {
        project,
        carry: { lastExportedAt: existingEntry?.lastExportedAt ?? null, origin: 'imported' as const },
      };
    });
    await repository.writeEntriesAndSummaries(items);
  }

  return { writtenIds, committedProjects, failed };
}

/**
 * Rollback (§4.1 poin 2, "Batalkan Semua"): hapus body yang sudah ditulis di
 * Fase 1. Entry/summary TIDAK pernah tersentuh untuk batch ini (Fase 2 belum
 * jalan kalau operator memilih rollback sebelum konfirmasi), jadi cukup
 * hapus body-nya saja.
 */
export async function rollbackBulkImport(writtenIds: string[]): Promise<void> {
  for (const id of writtenIds) {
    await repository.deleteProjectBody(id);
  }
}
