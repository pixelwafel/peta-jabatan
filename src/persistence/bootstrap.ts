import { getProjectIndex, getProject } from './storage';
import { useProjectStore } from '@/store/projectStore';
import { useProjectIndexStore } from '@/store/projectIndexStore';
import { scheduleSave, initSaveListeners } from './autosave';

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
      const activeProject = await getProject(index.activeId);
      if (activeProject) {
        useProjectStore.getState().setProject(activeProject);
      } else {
        // Fallback if body corrupted: pick first available entry
        const fallbackId = index.entries[0]?.id;
        if (fallbackId) {
          const fallbackProj = await getProject(fallbackId);
          if (fallbackProj) {
            useProjectStore.getState().setProject(fallbackProj);
          }
        }
      }
    }
    // else: storage benar-benar kosong -> project tetap null, canvas kosong.
  } catch (err) {
    console.error('Bootstrap persistence error:', err);
  }

  // Subscribe projectStore changes to scheduleSave
  useProjectStore.subscribe((state, prevState) => {
    if (state.project && state.project !== prevState.project) {
      scheduleSave(state.project);
    }
  });
}
