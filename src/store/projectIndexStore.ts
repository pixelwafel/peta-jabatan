import { create } from 'zustand';
import { getProjectIndex } from '@/persistence/storage';
import { ProjectIndex } from '@/persistence/types';

/**
 * Salinan in-memory dari ProjectIndex (persistence/types.ts), disegarkan lewat
 * `refresh()` setiap kali index di IndexedDB berubah (bootstrap awal, sesudah
 * autosave, sesudah operasi project manager). Diperlukan supaya resolusi link
 * node (selectors/linkResolver.ts) — dan lewat itu computeRecap/validateProject —
 * bisa tetap SINKRON (lihat docs/13-link-nodes.md §2): baca dari sini, bukan
 * `await getProjectIndex()` di tengah render/recap.
 *
 * Bukan sumber kebenaran — IndexedDB tetap itu. Ini cuma cache baca yang
 * "cukup segar", ditolerir karena figure yang salah oleh satu siklus refresh
 * yang terlewat jauh lebih murah daripada membuat recap jadi async.
 */
export interface ProjectIndexState {
  index: ProjectIndex | null;
  refresh: () => Promise<void>;
}

export const useProjectIndexStore = create<ProjectIndexState>(set => ({
  index: null,
  refresh: async () => {
    const index = await getProjectIndex();
    set({ index });
  },
}));
