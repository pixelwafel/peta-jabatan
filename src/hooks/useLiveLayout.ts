import { useMemo } from 'react';
import { OrgNode } from '@/models/node';
import { OrgEdge } from '@/models/edge';
import { computeLayout, TidyOptions } from '@/utils/layout';

/**
 * Posisi node dihitung otomatis dari struktur (Dagre), murni derived —
 * TIDAK ditulis ke store/commit, jadi tidak masuk riwayat undo.
 */
export function useLiveLayout(
  nodes: OrgNode[],
  edges: OrgEdge[],
  opts: TidyOptions
): Map<string, { x: number; y: number }> {
  return useMemo(
    () => computeLayout(nodes, edges, opts),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodes, edges, opts.direction, opts.scope, opts.rootId, opts.showJenjang]
  );
}
