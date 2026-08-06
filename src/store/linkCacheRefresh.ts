import { LinkRef } from '@/models/node';
import { ResolvedLink } from '@/models/derived';
import { setLiveResolveHandler } from '@/selectors/linkResolver';
import { useProjectStore } from './projectStore';

/**
 * Tulis balik angka hasil resolusi live ke `link.cached` node yang match
 * `kodeOPD`-nya, lewat commit `transient` (tidak menambah entri history —
 * operator tidak melakukan apa-apa, ini murni penyegaran cache).
 *
 * Fase 2.1 — dipindah dari selectors/linkResolver.ts (yang harus tetap
 * bebas-store supaya bisa dipakai di Web Worker). Modul ini adalah SATU-
 * SATUNYA jembatan balik dari pulau selector ke store; di-wire lewat
 * setLiveResolveHandler di bawah, aktif begitu modul ini di-import (lihat
 * persistence/bootstrap.ts untuk main thread, tests/link-resolver.test.ts
 * untuk test).
 */
export function scheduleCacheRefresh(ref: LinkRef, resolved: ResolvedLink): void {
  if (resolved.status !== 'live') return;

  const { commit } = useProjectStore.getState();
  commit(
    'Refresh cache tautan',
    draft => {
      for (const n of draft.nodes) {
        if (n.link?.kodeOPD === ref.kodeOPD) {
          n.link.cached = {
            kebutuhan: resolved.totals.kebutuhan,
            eksisting: resolved.totals.eksisting,
            nodeCount: resolved.nodeCount,
            updatedAt: resolved.asOf,
          };
        }
      }
    },
    { transient: true }
  );
}

setLiveResolveHandler(scheduleCacheRefresh);
