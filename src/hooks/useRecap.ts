import { useProjectStore } from '@/store/projectStore';
import { useProjectIndexStore } from '@/store/projectIndexStore';
import { getCachedRecap, EMPTY_INDEX } from '@/selectors/recap';
import { taxonomy } from '@/config/taxonomy';
import { Recap } from '@/models/derived';

/**
 * Fase 2.1 — dipindah dari selectors/recap.ts. Selector itu harus tetap
 * bebas React/store supaya bisa dipakai utuh di Web Worker (Fase 2.2); hook
 * React (dan langganan Zustand-nya) tinggal di lapisan hooks/, bukan
 * bercampur dengan fungsi murni computeRecap/getCachedRecap.
 */
export function useRecap(): Recap | null {
  const project = useProjectStore(s => s.project);
  // Link nodes butuh index (docs/13-link-nodes.md §3) — perubahannya (project
  // lain disimpan, link baru dibuat) tidak selalu mengubah project ini.
  // getCachedRecap membandingkan identitas index juga (bukan cuma project),
  // jadi perubahan index tetap memicu recompute walau project-nya sendiri
  // tidak berubah. Tidak perlu useMemo di sini — getCachedRecap SUDAH
  // memoized (WeakMap di selectors/recap.ts), pemanggilan berulang dengan
  // project+index yang sama adalah lookup O(1), dan objek Recap yang
  // dikembalikan stabil secara referensi selama belum ada commit baru.
  const index = useProjectIndexStore(s => s.index);

  if (!project) return null;
  return getCachedRecap(project, taxonomy, index ?? EMPTY_INDEX);
}
