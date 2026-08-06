import React, { memo, useMemo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Link2, AlertTriangle, Lock } from 'lucide-react';
import { NodeCardProps } from './CardTypes';
import { NODE_W } from '@/utils/layout';
import { resolveLink } from '@/selectors/linkResolver';
import { useProjectIndexStore } from '@/store/projectIndexStore';
import { useProjectStore } from '@/store/projectStore';
import { useUiStore } from '@/store/uiStore';
import { getProject } from '@/persistence/storage';
import { flushSave } from '@/persistence/autosave';
import { ProjectIndex } from '@/persistence/types';

const EMPTY_INDEX: ProjectIndex = { version: 1, activeId: null, entries: [] };
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Kartu untuk unit node yang menjadi tautan ke project lain (docs/13-link-nodes.md
 * §4). Glyph ⧉ dan border beda supaya kelihatan bukan unit biasa; tidak ada
 * chevron collapse karena link node tidak pernah punya children (doc 13 §1).
 */
export const LinkCard: React.FC<NodeCardProps> = memo(
  function LinkCard({ data, selected }) {
    const { node, locked } = data;
    const index = useProjectIndexStore(s => s.index);
    const setProject = useProjectStore(s => s.setProject);
    const openConfirm = useUiStore(s => s.openConfirm);

    const resolved = useMemo(() => {
      if (!node.link) return null;
      return resolveLink(node.link, index ?? EMPTY_INDEX);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [node.link, index]);

    if (!node.link || !resolved) return null;

    const isStale =
      resolved.status === 'cached' &&
      resolved.asOf &&
      Date.now() - Date.parse(resolved.asOf) > THIRTY_DAYS_MS;

    const borderColor = selected
      ? 'border-blue-500 ring-2 ring-blue-500/30'
      : resolved.status === 'unresolved'
      ? 'border-rose-800/70 hover:border-rose-700'
      : isStale
      ? 'border-amber-800/70 hover:border-amber-700'
      : 'border-indigo-800/70 hover:border-indigo-700';

    const selisihColor =
      resolved.totals.selisih < 0
        ? 'text-red-400 font-semibold'
        : resolved.totals.selisih > 0
        ? 'text-amber-400 font-semibold'
        : 'text-slate-400';

    const formattedDate = resolved.asOf
      ? new Date(resolved.asOf).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
      : '';

    const showWarning = resolved.status === 'unresolved' || isStale;

    const handleDoubleClick = async () => {
      if (resolved.status === 'live' && resolved.targetProjectId) {
        await flushSave();
        const target = await getProject(resolved.targetProjectId);
        if (target) setProject(target);
        return;
      }

      openConfirm({
        title: 'File tautan belum ada di browser ini',
        body:
          resolved.status === 'cached'
            ? `"${node.link!.namaProject}" belum tersimpan di browser ini — angka yang tampil berasal dari cache per ${formattedDate}. Impor file project ini lewat tombol "Impor" untuk membuka isinya.`
            : `"${node.link!.namaProject}" (kode ${node.link!.kodeOPD}) belum pernah diimpor di browser ini, jadi angkanya belum tersedia. Impor file project ini lewat tombol "Impor" begitu sudah ada.`,
        confirmLabel: 'Mengerti',
        onConfirm: () => {},
      });
    };

    return (
      <div
        style={{ width: NODE_W }}
        onDoubleClick={handleDoubleClick}
        className={`bg-slate-900 border rounded-lg shadow-md select-none transition-all ${borderColor}`}
      >
        <Handle type="target" position={Position.Top} className="!opacity-0 !pointer-events-none" />
        <Handle type="source" position={Position.Bottom} className="!opacity-0 !pointer-events-none" />

        <div className="h-1 bg-indigo-600 rounded-t-lg" />

        <div className="p-2.5 space-y-1.5">
          <div className="flex items-center justify-between space-x-1">
            <div className="flex items-center space-x-1.5 min-w-0 flex-1">
              <Link2 className="w-4 h-4 text-indigo-400 flex-shrink-0" />
              <span
                className="font-bold text-sm text-slate-200 tracking-tight uppercase truncate"
                title={node.nama}
              >
                {node.nama}
              </span>
            </div>
            <div className="flex items-center space-x-1 flex-shrink-0">
              {locked && (
                <span title="Terkunci">
                  <Lock className="w-3.5 h-3.5 text-amber-400" />
                </span>
              )}
              {showWarning && <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
            </div>
          </div>

          <div className="pt-1 border-t border-slate-800 flex items-center justify-between text-xs font-mono">
            {resolved.status === 'unresolved' ? (
              <span className="text-rose-400">angka tidak tersedia</span>
            ) : (
              <>
                <span className="text-slate-400">
                  Keb {resolved.totals.kebutuhan} · Eks {resolved.totals.eksisting}
                </span>
                <span className={selisihColor}>
                  {resolved.totals.selisih > 0 ? `+${resolved.totals.selisih}` : resolved.totals.selisih}
                </span>
              </>
            )}
          </div>

          {/* Baris tanggal/jumlah node hanya tampil saat bukan live (doc 13 §4) */}
          {resolved.status !== 'live' && (
            <div
              className={`text-[11px] font-mono flex items-center justify-between ${
                resolved.status === 'unresolved' ? 'text-rose-400' : isStale ? 'text-amber-400' : 'text-slate-500'
              }`}
            >
              <span>{resolved.nodeCount} node</span>
              {formattedDate && <span>per {formattedDate}</span>}
            </div>
          )}
        </div>
      </div>
    );
  },
  (prev, next) =>
    prev.data.node === next.data.node &&
    prev.data.locked === next.data.locked &&
    prev.selected === next.selected
);
