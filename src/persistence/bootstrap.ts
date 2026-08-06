import { getProjectIndex, getProjectWithMigrationFlag } from './storage';
import { useProjectStore } from '@/store/projectStore';
import { useProjectIndexStore } from '@/store/projectIndexStore';
import { scheduleSave, initSaveListeners } from './autosave';
// Fase 2.1 — side-effect import: mewiring selectors/linkResolver.ts
// (setLiveResolveHandler) balik ke store, supaya resolveLink() tetap
// menulis cache tautan seperti sebelumnya. Lihat store/linkCacheRefresh.ts.
import '@/store/linkCacheRefresh';

let initialized = false;

/**
 * Tidak ada lagi "project default" yang otomatis dibuat saat storage kosong
 * (dulu: "Dinas Sekretariat Daerah" dengan 1 node root). Tampilan awal harus
 * benar-benar bersih — `projectStore.project` tetap `null` sampai operator
 * membuat project baru atau mengimpor lewat Kelola Proyek. Semua komponen
 * shell (Canvas, StructurePanel, Toolbar, dst.) sudah null-safe untuk kondisi
 * ini (`project?.nodes ?? []` dan sejenisnya).
 */
export async function bootstrapPersistence(): Promise<void> {
  if (initialized) return;
  initialized = true;

  initSaveListeners();

  try {
    const index = await getProjectIndex();
    useProjectIndexStore.setState({ index });

    if (index.activeId && index.entries.length > 0) {
      const active = await getProjectWithMigrationFlag(index.activeId);
      if (active) {
        // rev: 1 kalau normalizeProject melakukan migrasi sekali-jalan (order
        // backfill / merge kepala struktural) — body itu HARUS tetap tersimpan
        // sekali meski operator belum mengedit apa pun. rev: 0 kalau tidak ada
        // migrasi, supaya membuka/membaca project TIDAK memicu autosave
        // (Fase 1.1) — dulu setiap buka project langsung menjadwalkan
        // validateProject+computeRecap+rewrite index penuh.
        useProjectStore.getState().setProject(active.project, { rev: active.migrated ? 1 : 0 });
      } else {
        // Fallback if body corrupted: pick first available entry
        const fallbackId = index.entries[0]?.id;
        if (fallbackId) {
          const fallback = await getProjectWithMigrationFlag(fallbackId);
          if (fallback) {
            useProjectStore.getState().setProject(fallback.project, { rev: fallback.migrated ? 1 : 0 });
          }
        }
      }
    }
    // else: storage benar-benar kosong -> project tetap null, canvas kosong.
  } catch (err) {
    console.error('Bootstrap persistence error:', err);
  }

  // Subscribe projectStore changes to scheduleSave. Referensi `project`
  // SELALU berubah pada tiap setProject/commit/undo/redo (Immer/applyPatches
  // selalu menghasilkan objek baru), jadi syarat `rev > 0` sendirian yang
  // membedakan "baru dibuka, belum ada yang perlu disimpan" (rev: 0) dari
  // "sudah dimigrasi saat load" atau "sudah diedit" (rev >= 1) — lihat
  // projectStore.ts setProject/commit. TIDAK cukup membandingkan
  // `state.rev !== prevState.rev` saja: dua project yang sama-sama baru
  // dimigrasi ujung-ujungnya sama-sama rev:1, jadi perbandingan rev semata
  // bisa gagal mendeteksi pergantian project.
  useProjectStore.subscribe((state, prevState) => {
    if (state.project && state.project !== prevState.project && state.rev > 0) {
      scheduleSave(state.project);
    }
  });
}
