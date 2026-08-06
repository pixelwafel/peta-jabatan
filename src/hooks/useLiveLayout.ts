import { useMemo } from 'react';
import { OrgNode } from '@/models/node';
import { OrgEdge } from '@/models/edge';
import { computeLayoutCached, TidyOptions } from '@/utils/layout';

/**
 * Posisi node dihitung otomatis dari struktur (Dagre), murni derived —
 * TIDAK ditulis ke store/commit, jadi tidak masuk riwayat undo.
 *
 * Fase 1.6: computeLayoutCached (bukan computeLayout mentah) — useMemo di
 * sini masih memicu pemanggilan tiap kali `nodes`/`edges` berganti referensi
 * (tiap commit), tapi computeLayoutCached SENDIRI membandingkan signature
 * geometri di dalam dan mengembalikan hasil lama kalau geometri tak berubah
 * (rename, isi rincian, keterangan, dll). Jadi Dagre asli cuma benar-benar
 * jalan saat topologi/ukuran kartu berubah, bukan tiap keystroke — Canvas.tsx
 * (satu-satunya pemanggil hook ini sejak TreeView pindah ke hitung-saat-klik)
 * langsung dapat manfaatnya tanpa perubahan lain.
 */
export function useLiveLayout(
  nodes: OrgNode[],
  edges: OrgEdge[],
  opts: TidyOptions
): Map<string, { x: number; y: number }> {
  return useMemo(
    () => computeLayoutCached(nodes, edges, opts),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodes, edges, opts.direction, opts.scope, opts.rootId, opts.showJenjang]
  );
}
