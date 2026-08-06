import { NodeTotals, ResolvedLink } from '@/models/derived';
import { LinkRef } from '@/models/node';
import { ProjectIndex } from '@/persistence/types';
import { useProjectStore } from '@/store/projectStore';

const ZERO: NodeTotals = { kebutuhan: 0, eksisting: 0, selisih: 0 };
const CYCLE_DEPTH_CAP = 10;

export function cachedTotals(ref: LinkRef): NodeTotals {
  const { kebutuhan, eksisting } = ref.cached;
  return { kebutuhan, eksisting, selisih: eksisting - kebutuhan };
}

/**
 * Resolusi link node (docs/13-link-nodes.md §2). SINKRON dengan disain —
 * hanya baca `index.entries`, array in-memory (lihat store/projectIndexStore.ts),
 * tidak ada I/O di sini. `computeRecap` butuh ini tetap sinkron; kalau resolveLink
 * perlu `await` baca IndexedDB, seluruh alur render recap jadi async.
 *
 * `index` di-pass sebagai parameter (bukan diakses lewat global) supaya fungsi
 * ini pure & gampang ditest tanpa menyiapkan store penuh.
 */
export function resolveLink(ref: LinkRef, index: ProjectIndex): ResolvedLink {
  const entry =
    index.entries.find(e => e.kodeOPD === ref.kodeOPD) ??
    (ref.projectId ? index.entries.find(e => e.id === ref.projectId) : undefined);

  if (!entry) {
    return ref.cached.updatedAt
      ? {
          status: 'cached',
          totals: cachedTotals(ref),
          nodeCount: ref.cached.nodeCount,
          asOf: ref.cached.updatedAt,
        }
      : { status: 'unresolved', totals: ZERO, nodeCount: 0, asOf: '' };
  }

  const resolved: ResolvedLink = {
    status: 'live',
    totals: {
      kebutuhan: entry.totalKebutuhan,
      eksisting: entry.totalEksisting,
      selisih: entry.totalEksisting - entry.totalKebutuhan,
    },
    nodeCount: entry.nodeCount,
    asOf: entry.updatedAt,
    targetProjectId: entry.id,
  };

  // Fire-and-forget side effect, TIDAK bagian dari resolusi — supaya tidak
  // memblokir computeRecap yang sinkron. File yang diekspor jadi selalu bawa
  // angka terbaru yang pernah dilihat browser ini.
  scheduleCacheRefresh(ref, resolved);

  return resolved;
}

/**
 * Tulis balik angka hasil resolusi live ke `link.cached` node yang match
 * `kodeOPD`-nya, lewat commit `transient` (tidak menambah entri history —
 * operator tidak melakukan apa-apa, ini murni penyegaran cache).
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

/**
 * Cycle guard (docs/13-link-nodes.md §2 "Cycle guard"): tolak pembuatan link
 * dari project `sourceKodeOPD` ke `targetKodeOPD` kalau target (langsung atau
 * transitif lewat `linkedCodes`-nya) balik mereferensikan sourceKodeOPD.
 * Depth-capped 10 — siklus yang lolos lewat file yang diedit manual di luar
 * app cuma berakibat angka basi (resolveLink baca dari index cache), bukan
 * rekursi tak berhingga; guard ini + finding LINK_CYCLE (M10.8) yang menjaga
 * supaya tetap kelihatan.
 */
export function canCreateLink(
  index: ProjectIndex,
  sourceKodeOPD: string,
  targetKodeOPD: string
): boolean {
  if (sourceKodeOPD === targetKodeOPD) return false;

  const visited = new Set<string>();
  const walk = (kodeOPD: string, depth: number): boolean => {
    if (depth > CYCLE_DEPTH_CAP) return true; // depth cap: anggap aman, biar tak infinite
    if (visited.has(kodeOPD)) return true;
    visited.add(kodeOPD);

    const entry = index.entries.find(e => e.kodeOPD === kodeOPD);
    if (!entry?.linkedCodes) return true;

    for (const linked of entry.linkedCodes) {
      if (linked === sourceKodeOPD) return false; // siklus ditemukan
      if (!walk(linked, depth + 1)) return false;
    }
    return true;
  };

  return walk(targetKodeOPD, 0);
}
