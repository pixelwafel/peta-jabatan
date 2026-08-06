import { Project } from '@/models/project';
import { RecapBucket } from '@/models/derived';
import { ProjectIndexEntry } from '@/persistence/types';
import { computeRecap } from './recap';
import { taxonomy } from '@/config/taxonomy';
import { getKategori } from '@/config/resolver';

export interface GlobalBreakdownOptions {
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
}

function yieldToUi(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

/**
 * Rekap per-kategori se-pemda (docs/14-recap-dashboard.md §5) — satu-satunya
 * bagian dashboard yang butuh body project (bukan cuma index), karena
 * pemecahan struktural/fungsional/pelaksana tidak ada di ProjectIndexEntry.
 *
 * Sequential dengan UI yield tiap project (bukan Promise.all) dan bisa
 * dibatalkan lewat AbortSignal — dashboard tetap responsif walau 60 project.
 * Figur link-node (docs/13) sudah ikut di total masing-masing project
 * (lihat persistence/storage.ts buildIndexEntry) tapi TIDAK dipecah ke
 * kategori di sini — cache link cuma menyimpan agregat, bukan rincian
 * per-kategori, sehingga breakdown per-kategori project bertaut hanya
 * mencerminkan isi project itu sendiri, bukan project yang ditautkannya.
 *
 * `readProject` di-pass sebagai parameter (bukan import langsung dari
 * persistence/storage) supaya fungsi ini gampang ditest tanpa IndexedDB.
 */
export async function computeGlobalBreakdown(
  topLevel: ProjectIndexEntry[],
  readProject: (id: string) => Promise<Project | null>,
  opts: GlobalBreakdownOptions = {}
): Promise<RecapBucket[]> {
  const acc = new Map<string, { keb: number; eks: number; n: number }>();
  for (const k of taxonomy.kategori) acc.set(k.id, { keb: 0, eks: 0, n: 0 });
  acc.set('__tanpa_kategori__', { keb: 0, eks: 0, n: 0 });

  for (let i = 0; i < topLevel.length; i++) {
    if (opts.signal?.aborted) break;

    const project = await readProject(topLevel[i].id);
    if (project) {
      const recap = computeRecap(project, taxonomy);
      for (const bucket of recap.perKategori) {
        const a = acc.get(bucket.key) ?? { keb: 0, eks: 0, n: 0 };
        a.keb += bucket.kebutuhan;
        a.eks += bucket.eksisting;
        a.n += bucket.nodeCount;
        acc.set(bucket.key, a);
      }
    }

    opts.onProgress?.(i + 1, topLevel.length);
    if (i < topLevel.length - 1) await yieldToUi();
  }

  return Array.from(acc.entries())
    .map(([key, b]) => ({
      key,
      label: key === '__tanpa_kategori__' ? 'Belum berkategori' : getKategori(key)?.nama ?? key,
      kebutuhan: b.keb,
      eksisting: b.eks,
      selisih: b.eks - b.keb,
      nodeCount: b.n,
    }))
    .filter(b => b.nodeCount > 0 || b.key !== '__tanpa_kategori__');
}
