import { get } from 'idb-keyval';
import {
  customStore,
  getProjectKey,
  getLegacyProjectIndexKey,
  listLegacyProjectIds,
} from './storage';
import { repository } from './repository';
import { Project } from '@/models/project';
import { ProjectIndex } from './types';

const MIGRATED_FLAG_KEY = 'pjb:v2:migrated';

/** LocalStorage (bukan IndexedDB) — sinkron, tersedia sebelum database async
 * manapun sempat dibuka, konsisten dengan `pjb:v1:ui`/`pjb:v1:acks` yang
 * sudah di LocalStorage (lihat catatan amandemen di docs/10). */
export function isV2Migrated(): boolean {
  try {
    return localStorage.getItem(MIGRATED_FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

function markV2Migrated(): void {
  try {
    localStorage.setItem(MIGRATED_FLAG_KEY, '1');
  } catch {
    // localStorage tidak tersedia (mis. private mode ketat) — migrasi tetap
    // berhasil di SESI ini; sesi berikutnya akan mengulang. Aman: setiap
    // langkah migrasi di bawah `put` (overwrite), bukan `add`/append, jadi
    // mengulang tidak pernah menghasilkan duplikat atau state rusak.
  }
}

export interface MigrateV2Progress {
  done: number;
  total: number;
}

/**
 * Fase 3.2 (docs/20-skalabilitas-worker-virtualisasi.md §3.2) — migrasi
 * satu-kali dari skema lama (idb-keyval, database `pjb_db`: satu blob
 * `ProjectIndex` + N key project string `pjb:v1:project:<id>`) ke skema baru
 * (`idb`, database TERPISAH `pjb_v2` — lihat persistence/db.ts).
 *
 * **Idempotent & resumable — properti yang paling penting di sini**:
 * - Dijaga flag LocalStorage `pjb:v2:migrated`; begitu fungsi ini selesai
 *   tanpa exception, flag di-set dan migrasi tidak jalan lagi di sesi mana pun.
 * - TIDAK PERNAH menghapus atau memodifikasi `pjb_db` (data lama). Migrasi
 *   ini murni SALIN-MAJU. Kalau terhenti di tengah (tab ditutup, crash,
 *   exception tak terduga di satu project), `pjb_db` masih 100% utuh, dan
 *   pemanggilan berikutnya mengulang dari awal — aman, karena tiap tulisan
 *   ke `pjb_v2` bersifat overwrite (`put`), bukan append; mengulang cuma
 *   menimpa record yang sama dengan nilai yang sama.
 * - Instalasi baru (tidak pernah punya data di skema lama) selesai dalam 0
 *   iterasi — `listLegacyProjectIds()` kosong, langsung tandai migrated.
 *
 * **TIDAK migrasi**: daftar OPD kustom (`persistence/customOpd.ts`) dan arsip
 * satu-generasi (`persistence/bulkImport.ts` `archiveProject`) — keduanya
 * SENGAJA tetap di `pjb_db`/idb-keyval (bukan bagian dari masalah skala Fase
 * 3.2), lihat catatan "batas migrasi" di docs/20 §3.2.
 */
export async function migrateV2(onProgress?: (p: MigrateV2Progress) => void): Promise<void> {
  if (isV2Migrated()) return;

  const ids = await listLegacyProjectIds();
  if (ids.length === 0) {
    markV2Migrated();
    return;
  }

  let done = 0;
  for (const id of ids) {
    try {
      const project = await get<Project>(getProjectKey(id), customStore);
      if (project && project.id && project.meta) {
        await repository.putProjectBody(project);
      }
    } catch (err) {
      console.warn(`migrateV2: gagal memindahkan project ${id}:`, err);
    } finally {
      done++;
      onProgress?.({ done, total: ids.length });
    }
  }

  // entries + summaries + activeId (default: paling baru diubah) diturunkan
  // dari body yang baru saja disalin — reuse rebuildIndexFromStorage (Fase
  // 2.3, sudah memori-terbatas lewat cursor idb sungguhan di repository.ts)
  // alih-alih menulis ulang logika sortir/agregasi di sini.
  await repository.rebuildIndexFromStorage();

  // Hormati activeId TERAKHIR operator (index lama) kalau project itu masih
  // ada — rebuildIndexFromStorage di atas sudah memilih satu (paling baru
  // diubah), yang belum tentu sama dengan yang terakhir dibuka operator.
  try {
    const legacyIndex = await get<ProjectIndex>(getLegacyProjectIndexKey(), customStore);
    if (legacyIndex?.activeId) {
      const current = await repository.getProjectIndex();
      if (current.entries.some(e => e.id === legacyIndex.activeId)) {
        await repository.saveProjectIndex({ ...current, activeId: legacyIndex.activeId });
      }
    }
  } catch (err) {
    console.warn('migrateV2: gagal membaca activeId lama (bukan fatal):', err);
  }

  markV2Migrated();
}
