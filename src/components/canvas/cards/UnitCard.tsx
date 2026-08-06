import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { ChevronRight, ChevronDown, Folder, AlertTriangle, UserCog, Lock, LayoutGrid } from 'lucide-react';
import { NodeCardProps } from './CardTypes';
import { useProjectStore } from '@/store/projectStore';
import { NODE_W } from '@/utils/layout';
import { jenjangLabel } from '@/config/resolver';

export const UnitCard: React.FC<NodeCardProps> = memo(
  function UnitCard({ data, selected }) {
    const { node, subtotals, childCount, hasFindings, locked, instanceMarker } = data;
    const updateNode = useProjectStore(s => s.updateNode);

    const handleToggleCollapse = (e: React.MouseEvent) => {
      e.stopPropagation();
      updateNode(node.id, { collapsed: !node.collapsed });
    };

    const dispTotals = subtotals ?? { kebutuhan: 0, eksisting: 0, selisih: 0 };
    const selisihColor =
      dispTotals.selisih < 0
        ? 'text-red-400 font-semibold'
        : dispTotals.selisih > 0
        ? 'text-amber-400 font-semibold'
        : 'text-slate-400';

    return (
      <div
        style={{ width: NODE_W }}
        className={`bg-slate-900 border rounded-lg shadow-md select-none transition-all ${
          selected
            ? 'border-blue-500 ring-2 ring-blue-500/30'
            : node.isTemplate
            ? 'border-teal-700/70 hover:border-teal-600'
            : 'border-slate-700 hover:border-slate-600'
        }`}
      >
        {/* Titik jangkar garis edge (tersembunyi — nodesConnectable={false},
            di sini murni supaya React Flow punya koordinat sambungan) */}
        <Handle
          type="target"
          position={Position.Top}
          className="!opacity-0 !pointer-events-none"
        />
        <Handle
          type="source"
          position={Position.Bottom}
          className="!opacity-0 !pointer-events-none"
        />

        {/* Accent bar */}
        <div className={`h-1 rounded-t-lg ${node.isTemplate ? 'bg-teal-500' : 'bg-slate-500'}`} />

        <div className="p-2.5 space-y-1.5">
          {/* Header row */}
          <div className="flex items-center justify-between space-x-1">
            <div className="flex items-center space-x-1.5 min-w-0 flex-1">
              {childCount > 0 && (
                <button
                  onClick={handleToggleCollapse}
                  className="p-0.5 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-200"
                  title={node.collapsed ? 'Buka struktur' : 'Tutup struktur'}
                >
                  {node.collapsed ? (
                    <ChevronRight className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </button>
              )}
              {node.isTemplate ? (
                <LayoutGrid className="w-4 h-4 text-teal-400 flex-shrink-0" />
              ) : (
                <Folder className="w-4 h-4 text-slate-400 flex-shrink-0" />
              )}
              <span
                className="font-bold text-sm text-slate-200 tracking-tight uppercase truncate"
                title={node.nama}
              >
                {node.nama}
              </span>
            </div>

            <div className="flex items-center space-x-1 flex-shrink-0">
              {node.isTemplate && (
                <span
                  title="Unit template (docs/15-template-instance.md)"
                  className="text-[9px] font-semibold text-teal-400 bg-teal-950/50 border border-teal-800/60 rounded px-1 py-0.5 uppercase tracking-wider"
                >
                  Template
                </span>
              )}
              {locked && (
                <span title="Terkunci">
                  <Lock className="w-3.5 h-3.5 text-amber-400" />
                </span>
              )}
              {hasFindings && <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
            </div>
          </div>

          {/* Kepala unit (struktural), bila diisi */}
          {node.kepalaUnit && (
            <div className="flex items-center space-x-1.5 text-[11px] text-slate-400 min-w-0">
              <UserCog className="w-3 h-3 text-blue-400 flex-shrink-0" />
              <span className="truncate">
                {node.kepalaUnit.nama || `Kepala ${node.nama}`}
                {node.kepalaUnit.jenjangId
                  ? ` · ${jenjangLabel(node.kepalaUnit.jenjangId, 'struktural')}`
                  : ''}
              </span>
            </div>
          )}

          {/* Subtotals (aggregate figures, read-only) */}
          <div className="pt-1 border-t border-slate-800 flex items-center justify-between text-xs font-mono">
            <span className="text-slate-400">
              Keb {dispTotals.kebutuhan} · Eks {dispTotals.eksisting}
            </span>
            <span className={selisihColor}>
              {dispTotals.selisih > 0 ? `+${dispTotals.selisih}` : dispTotals.selisih}
            </span>
          </div>

          {/* Marker "Σ N satuan" (docs/15-template-instance.md §3) — tampil di
              unit template itu sendiri MAUPUN sub-unit di dalam subtree-nya;
              angka di kartu ini adalah SUM lintas satuan, read-only. */}
          {instanceMarker !== undefined && (
            <div className="text-[11px] text-teal-400 font-mono flex items-center space-x-1">
              <LayoutGrid className="w-3 h-3" />
              <span>Σ {instanceMarker} satuan</span>
            </div>
          )}

          {/* Collapsed badge */}
          {node.collapsed && childCount > 0 && (
            <div className="mt-1 bg-slate-800/80 text-slate-300 rounded px-1.5 py-0.5 text-[11px] flex items-center justify-between font-mono">
              <span>+{childCount} tersembunyi</span>
            </div>
          )}
        </div>
      </div>
    );
  },
  (prev, next) =>
    prev.data.node === next.data.node &&
    prev.data.totals.kebutuhan === next.data.totals.kebutuhan &&
    prev.data.totals.eksisting === next.data.totals.eksisting &&
    prev.data.subtotals?.kebutuhan === next.data.subtotals?.kebutuhan &&
    prev.data.subtotals?.eksisting === next.data.subtotals?.eksisting &&
    prev.data.hasFindings === next.data.hasFindings &&
    prev.data.childCount === next.data.childCount &&
    prev.data.showJenjang === next.data.showJenjang &&
    prev.data.locked === next.data.locked &&
    prev.data.instanceMarker === next.data.instanceMarker &&
    prev.selected === next.selected
);
