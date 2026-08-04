import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { AlertTriangle, UserCheck, Lock } from 'lucide-react';
import { NodeCardProps } from './CardTypes';
import { kategoriWarna, jenjangLabel, jenjangSingkatan, getKategori } from '@/config/resolver';
import { NODE_W } from '@/utils/layout';

export const JabatanCard: React.FC<NodeCardProps> = memo(
  function JabatanCard({ data, selected }) {
    const { node, totals, hasFindings, showJenjang, locked } = data;

    const accentColor = kategoriWarna(node);
    const kategori = getKategori(node.kategoriId);

    // Format single row jenjang or category label
    let classLabel = kategori?.nama ?? 'Jabatan';
    if (node.rincian.length === 1 && node.rincian[0].jenjangId) {
      classLabel = `${classLabel} · ${jenjangLabel(node.rincian[0].jenjangId, node.kategoriId)}`;
    } else if (node.rumpun.length > 0) {
      const rumpunLabel = node.rumpun.map(r => (r === 'keahlian' ? 'Keahlian' : 'Keterampilan')).join('/');
      classLabel = `${classLabel} · ${rumpunLabel}`;
    }

    const selisihColor =
      totals.selisih < 0
        ? 'text-red-400 font-semibold'
        : totals.selisih > 0
        ? 'text-amber-400 font-semibold'
        : 'text-slate-400';

    return (
      <div
        style={{ width: NODE_W }}
        className={`bg-slate-900 border rounded-lg shadow-md select-none transition-all ${
          selected
            ? 'border-blue-500 ring-2 ring-blue-500/30'
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

        {/* Category Accent Bar */}
        <div className="h-1 rounded-t-lg" style={{ backgroundColor: accentColor }} />

        <div className="p-2.5 space-y-1.5">
          {/* Title & badge row */}
          <div className="flex items-start justify-between space-x-1">
            <div className="min-w-0 flex-1">
              <h4
                className="font-semibold text-sm text-slate-100 line-clamp-2 leading-tight tracking-tight"
                title={node.nama}
              >
                {node.nama}
              </h4>
              <p className="text-[11px] text-slate-400 truncate mt-0.5" title={classLabel}>
                {classLabel}
              </p>
            </div>

            <div className="flex items-center space-x-1 flex-shrink-0 mt-0.5">
              {locked && (
                <span title={node.locked ? 'Terkunci' : 'Terkunci (mengikuti unit induk)'}>
                  <Lock className={`w-3.5 h-3.5 ${node.locked ? 'text-amber-400' : 'text-slate-500'}`} />
                </span>
              )}
              {hasFindings ? (
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              ) : (
                <UserCheck className="w-3.5 h-3.5 text-slate-600" />
              )}
            </div>
          </div>

          {/* Node Totals */}
          <div className="pt-1 border-t border-slate-800 flex items-center justify-between text-xs font-mono">
            <span className="text-slate-300">
              Keb {totals.kebutuhan} · Eks {totals.eksisting}
            </span>
            <span className={selisihColor}>
              {totals.selisih > 0 ? `+${totals.selisih}` : totals.selisih}
            </span>
          </div>

          {/* Compact Per-Level Breakdown */}
          {showJenjang && node.rincian.length > 1 && (
            <div className="pt-1 border-t border-slate-800/60 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] font-mono text-slate-400">
              {node.rincian.map(r => (
                <span key={r.id}>
                  {jenjangSingkatan(r.jenjangId, node.kategoriId)} {r.kebutuhan}/{r.eksisting}
                </span>
              ))}
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
    prev.data.hasFindings === next.data.hasFindings &&
    prev.data.showJenjang === next.data.showJenjang &&
    prev.data.locked === next.data.locked &&
    prev.selected === next.selected
);
