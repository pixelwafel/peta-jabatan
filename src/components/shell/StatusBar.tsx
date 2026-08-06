import React, { useMemo } from 'react';
import { useProjectStore } from '@/store/projectStore';
import { useUiStore } from '@/store/uiStore';
import { projectTotals } from '@/selectors/totals';
import { AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react';

export const StatusBar: React.FC = () => {
  const project = useProjectStore(s => s.project);
  const saveStatus = useUiStore(s => s.saveStatus);
  const lastSavedAt = useUiStore(s => s.lastSavedAt);

  const nodes = project?.nodes ?? [];
  // Fase 1.5: di-memo per referensi `nodes` — StatusBar juga subscribe ke
  // saveStatus/lastSavedAt (uiStore), yang berubah lepas dari project (mis.
  // status autosave "saving" -> "saved" tanpa project berubah). Tanpa memo,
  // reduce+projectTotals (O(N)) dihitung ulang tiap kali salah satu dari itu
  // berubah walau nodes-nya sama persis.
  const { rincianCount, totals } = useMemo(() => {
    return {
      rincianCount: nodes.reduce((acc, n) => acc + n.rincian.length, 0),
      totals: projectTotals(nodes),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes]);

  const formatTime = (isoString: string | null) => {
    if (!isoString) return '';
    try {
      return new Date(isoString).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  };

  const selisihColor =
    totals.selisih < 0
      ? 'text-red-400 font-semibold'
      : totals.selisih > 0
      ? 'text-amber-400 font-semibold'
      : 'text-slate-300';

  return (
    <footer className="h-[28px] bg-slate-950 border-t border-slate-800 text-slate-400 text-xs px-3 flex items-center justify-between font-mono select-none">
      {/* Save Status & Node Counts */}
      <div className="flex items-center space-x-3">
        {saveStatus === 'saving' && (
          <span className="flex items-center space-x-1 text-blue-400">
            <RefreshCw className="w-3 h-3 animate-spin" />
            <span>Menyimpan…</span>
          </span>
        )}

        {saveStatus === 'saved' && (
          <span className="flex items-center space-x-1.5 text-emerald-400">
            <CheckCircle className="w-3 h-3" />
            <span>Tersimpan {formatTime(lastSavedAt)}</span>
          </span>
        )}

        {saveStatus === 'error' && (
          <span className="flex items-center space-x-1 text-rose-400 font-semibold">
            <AlertTriangle className="w-3 h-3" />
            <span>⛔ Gagal menyimpan</span>
          </span>
        )}

        <span className="text-slate-800">│</span>
        <span>
          {nodes.length} node · {rincianCount} rincian
        </span>
      </div>

      {/* Totals & App Version */}
      <div className="flex items-center space-x-3">
        <span>
          Keb {totals.kebutuhan} · Eks {totals.eksisting} ·{' '}
          <span className={selisihColor}>
            {totals.selisih > 0 ? `+${totals.selisih}` : totals.selisih}
          </span>
        </span>
        <span className="text-slate-800">│</span>
        <span className="text-slate-500">
          v{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0'}
        </span>
      </div>
    </footer>
  );
};
