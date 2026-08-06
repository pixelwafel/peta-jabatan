import React, { useEffect, useMemo, useState } from 'react';
import { ProjectIndex } from '@/persistence/types';
import { getProjectIndex, getProject } from '@/persistence/storage';
import { getCustomOpdList } from '@/persistence/customOpd';
import { buildOpdIndex, daftarOpdBawaan } from '@/config/daftarOpd';
import {
  computeTopLevel,
  sumTopLevelTotals,
  isEntryStale,
  buildDashboardCards,
  DashboardCard,
  LAINNYA_KELOMPOK,
} from '@/selectors/dashboard';
import { computeGlobalBreakdown } from '@/selectors/globalBreakdown';
import { buildConsolidatedWorkbook } from '@/export/consolidatedExporter';
import { RecapBucket } from '@/models/derived';
import { useProjectStore } from '@/store/projectStore';
import { ImportDialog } from '../dialogs/ImportDialog';
import { downloadBlob } from '@/utils/download';
import {
  LayoutDashboard,
  X,
  Upload,
  Download,
  AlertTriangle,
  Clock,
  Link2,
  ArrowUpDown,
  Loader2,
} from 'lucide-react';

interface RecapDashboardProps {
  onClose: () => void;
}

type SortKey = 'nama' | 'kebutuhan' | 'eksisting' | 'selisih' | 'terisi' | 'diubah';

function formatDate(iso: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

const CardView: React.FC<{
  card: DashboardCard;
  onOpen: (id: string) => void;
  onImportHere: () => void;
}> = ({ card, onOpen, onImportHere }) => {
  const { entry } = card;

  if (!entry) {
    return (
      <div className="border-2 border-dashed border-slate-700 rounded-lg p-3 bg-slate-950/20 flex flex-col justify-between min-h-[104px]">
        <div>
          <div className="font-mono text-[10px] text-slate-500">{card.kodeOPD}</div>
          <div className="text-xs font-semibold text-slate-400 truncate" title={card.namaOPD}>
            {card.namaOPD}
          </div>
        </div>
        <div className="flex items-center justify-between mt-2">
          <span className="text-[11px] text-slate-500 italic">belum masuk</span>
          <button
            onClick={onImportHere}
            className="flex items-center space-x-1 px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-blue-400 rounded text-[11px] font-medium"
          >
            <Upload className="w-3 h-3" />
            <span>Impor</span>
          </button>
        </div>
      </div>
    );
  }

  const stale = isEntryStale(entry);
  const errors = entry.findingCounts?.errors ?? 0;
  const warnings = entry.findingCounts?.warnings ?? 0;
  const hasFindings = errors + warnings > 0;
  const selisih = entry.totalEksisting - entry.totalKebutuhan;

  return (
    <button
      onClick={() => onOpen(entry.id)}
      className="text-left border rounded-lg p-3 bg-slate-950/40 border-slate-800 hover:border-slate-600 transition-colors min-h-[104px] flex flex-col justify-between"
    >
      <div>
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] text-slate-500">{card.kodeOPD}</span>
          <div className="flex items-center space-x-1">
            {card.isUnregistered && (
              <span title="Kode tidak ada di daftar OPD">
                <AlertTriangle className="w-3 h-3 text-blue-400" />
              </span>
            )}
            {hasFindings && (
              <span title={`${errors} error, ${warnings} peringatan`}>
                <AlertTriangle className="w-3 h-3 text-amber-400" />
              </span>
            )}
          </div>
        </div>
        <div className="text-xs font-semibold text-slate-100 truncate" title={card.namaOPD}>
          {card.namaOPD}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between font-mono text-[11px] text-slate-300">
          <span>
            {entry.totalKebutuhan}/{entry.totalEksisting}
          </span>
          <span className={selisih < 0 ? 'text-red-400 font-semibold' : selisih > 0 ? 'text-amber-400 font-semibold' : 'text-slate-500'}>
            {selisih > 0 ? `+${selisih}` : selisih}
          </span>
        </div>
        <div className="flex items-center justify-between mt-0.5 text-[10px] text-slate-500">
          <span className={stale ? 'text-amber-400 flex items-center space-x-0.5' : ''}>
            {stale && <Clock className="w-2.5 h-2.5 inline mr-0.5" />}
            {formatDate(entry.updatedAt)}
          </span>
          {card.linkedChildIds.length > 0 && (
            <span className="flex items-center space-x-0.5 text-indigo-400">
              <Link2 className="w-2.5 h-2.5" />
              <span>{card.linkedChildIds.length}</span>
            </span>
          )}
        </div>
      </div>
    </button>
  );
};

export const RecapDashboard: React.FC<RecapDashboardProps> = ({ onClose }) => {
  const [index, setIndex] = useState<ProjectIndex | null>(null);
  const [opdIdx, setOpdIdx] = useState<ReturnType<typeof buildOpdIndex> | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('nama');
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [showImport, setShowImport] = useState(false);
  const [breakdown, setBreakdown] = useState<RecapBucket[] | null>(null);
  const [breakdownProgress, setBreakdownProgress] = useState<{ done: number; total: number } | null>(null);
  const [isExportingConsolidated, setIsExportingConsolidated] = useState(false);

  const setProject = useProjectStore(s => s.setProject);

  const loadData = async () => {
    const [idx, customList] = await Promise.all([getProjectIndex(), getCustomOpdList()]);
    setIndex(idx);
    setOpdIdx(buildOpdIndex(customList));
  };

  useEffect(() => {
    loadData();
  }, []);

  const { topLevel, linkedUnder, doubleLinked } = useMemo(
    () => computeTopLevel(index?.entries ?? []),
    [index]
  );

  const groups = useMemo(() => {
    if (!opdIdx) return new Map<string, DashboardCard[]>();
    return buildDashboardCards(topLevel, linkedUnder, opdIdx);
  }, [topLevel, linkedUnder, opdIdx]);

  const headline = useMemo(() => sumTopLevelTotals(topLevel), [topLevel]);

  // Breakdown per-kategori (doc 14 §5) — satu-satunya bagian yang buka body
  // project, jadi dimuat progresif SETELAH kartu (dari index) tampil, dan
  // dibatalkan lewat AbortController saat dialog ditutup/topLevel berubah
  // ("aborts cleanly on navigation", exit criteria doc 14 §7).
  useEffect(() => {
    if (topLevel.length === 0) {
      setBreakdown([]);
      return;
    }

    const controller = new AbortController();
    setBreakdown(null);
    setBreakdownProgress({ done: 0, total: topLevel.length });

    computeGlobalBreakdown(topLevel, getProject, {
      signal: controller.signal,
      onProgress: (done, total) => setBreakdownProgress({ done, total }),
    }).then(buckets => {
      if (!controller.signal.aborted) setBreakdown(buckets);
    });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topLevel]);
  const staleCount = topLevel.filter(isEntryStale).length;
  const problemCount = topLevel.filter(e => (e.findingCounts?.errors ?? 0) > 0).length;
  const expectedCount = opdIdx ? new Set(Array.from(opdIdx.values()).map(o => o.kode)).size : 0;
  const submittedCount = topLevel.filter(e => opdIdx && opdIdx.has(e.kodeOPD)).length;

  const kelompokOrder = ['Sekretariat', 'Dinas', 'Badan', 'RSUD', 'Kecamatan', LAINNYA_KELOMPOK];
  const sortedGroupKeys = Array.from(groups.keys()).sort((a, b) => {
    const ai = kelompokOrder.indexOf(a);
    const bi = kelompokOrder.indexOf(b);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
  });

  const comparisonRows = useMemo(() => {
    const rows = topLevel.map(e => ({
      id: e.id,
      nama: e.namaOPD,
      kebutuhan: e.totalKebutuhan,
      eksisting: e.totalEksisting,
      selisih: e.totalEksisting - e.totalKebutuhan,
      terisi: e.totalKebutuhan > 0 ? (e.totalEksisting / e.totalKebutuhan) * 100 : 0,
      diubah: e.updatedAt,
    }));

    rows.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'nama') cmp = a.nama.localeCompare(b.nama, 'id');
      else if (sortKey === 'diubah') cmp = Date.parse(a.diubah) - Date.parse(b.diubah);
      else cmp = a[sortKey] - b[sortKey];
      return cmp * sortDir;
    });

    return rows;
  }, [topLevel, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => (d === 1 ? -1 : 1));
    else {
      setSortKey(key);
      setSortDir(1);
    }
  };

  const handleExportConsolidated = async () => {
    if (!index || isExportingConsolidated) return;
    setIsExportingConsolidated(true);
    try {
      const blob = await buildConsolidatedWorkbook(index, getProject);
      const date = new Date().toISOString().slice(0, 10);
      downloadBlob(blob, `peta-jabatan_konsolidasi_${date}.xlsx`);
    } finally {
      setIsExportingConsolidated(false);
    }
  };

  const handleOpen = async (id: string) => {
    const p = await getProject(id);
    if (p) {
      setProject(p);
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 select-none"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-w-6xl w-full flex flex-col max-h-[90vh] overflow-hidden text-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950/40 flex-shrink-0">
          <div className="flex items-center space-x-2 font-semibold text-sm text-slate-100">
            <LayoutDashboard className="w-4 h-4 text-blue-400" />
            <span>Dashboard Rekap Pemerintah</span>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={handleExportConsolidated}
              disabled={!index || topLevel.length === 0 || isExportingConsolidated}
              title="Satu workbook: sheet rekap pemerintah + satu sheet per OPD top-level + sheet tautan (doc 14 §5)"
              className="flex items-center space-x-1.5 px-2.5 py-1 bg-emerald-700/80 hover:bg-emerald-600 disabled:opacity-40 text-white rounded text-xs font-medium"
            >
              {isExportingConsolidated ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              <span>Ekspor Konsolidasi</span>
            </button>
            <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          {/* Headline */}
          <div className="p-3 rounded-lg border border-slate-800 bg-slate-950/40 space-y-1">
            <div className="flex items-center justify-between font-mono text-sm">
              <span className="text-slate-200">
                Keb {headline.kebutuhan.toLocaleString('id-ID')} · Eks {headline.eksisting.toLocaleString('id-ID')} ·{' '}
                <span className={headline.selisih < 0 ? 'text-red-400' : headline.selisih > 0 ? 'text-amber-400' : 'text-slate-400'}>
                  {headline.selisih > 0 ? `+${headline.selisih}` : headline.selisih}
                </span>
              </span>
              <span className="text-slate-400">
                {submittedCount} dari {expectedCount} OPD masuk
              </span>
            </div>
            <div className="flex items-center space-x-3 text-[11px] text-slate-500">
              {staleCount > 0 && (
                <span className="flex items-center space-x-1 text-amber-400">
                  <Clock className="w-3 h-3" />
                  <span>{staleCount} file basi (&gt;30 hari)</span>
                </span>
              )}
              {problemCount > 0 && (
                <span className="flex items-center space-x-1 text-rose-400">
                  <AlertTriangle className="w-3 h-3" />
                  <span>{problemCount} file bermasalah</span>
                </span>
              )}
              {doubleLinked.length > 0 && (
                <span className="flex items-center space-x-1 text-rose-400" title="DASH_DOUBLE_LINKED">
                  <Link2 className="w-3 h-3" />
                  <span>{doubleLinked.length} tautan ganda</span>
                </span>
              )}
              <span className="text-slate-600">Daftar OPD v{daftarOpdBawaan.listVersion}</span>
            </div>
          </div>

          {/* Card groups */}
          {sortedGroupKeys.map(kelompok => (
            <div key={kelompok} className="space-y-1.5">
              <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800 pb-1">
                {kelompok}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                {groups.get(kelompok)!.map(card => (
                  <CardView
                    key={card.kodeOPD}
                    card={card}
                    onOpen={handleOpen}
                    onImportHere={() => setShowImport(true)}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* Per-kategori se-pemda — progresif (doc 14 §5) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-1">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                Per Kategori (Se-Pemda)
              </span>
              {breakdown === null && breakdownProgress && (
                <span className="flex items-center space-x-1.5 text-[11px] text-slate-500">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>
                    Memuat {breakdownProgress.done}/{breakdownProgress.total}...
                  </span>
                </span>
              )}
            </div>
            {breakdown === null ? (
              <div className="text-slate-500 italic py-2">Menghitung rekap per kategori...</div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 font-mono">
                {breakdown.map(b => (
                  <div key={b.key} className="border border-slate-800 rounded p-2 bg-slate-950/40">
                    <div className="text-[10px] text-slate-500 uppercase truncate">{b.label}</div>
                    <div className="text-slate-200">
                      Keb {b.kebutuhan} · Eks {b.eksisting}
                    </div>
                    <div className={b.selisih < 0 ? 'text-red-400' : b.selisih > 0 ? 'text-amber-400' : 'text-slate-500'}>
                      {b.selisih > 0 ? `+${b.selisih}` : b.selisih}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Comparison table */}
          <div className="space-y-1.5">
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800 pb-1">
              Tabel Perbandingan
            </div>
            <div className="border border-slate-800 rounded overflow-hidden">
              <table className="w-full font-mono text-[11px]">
                <thead>
                  <tr className="bg-slate-950/60 text-slate-400">
                    {(
                      [
                        ['nama', 'Nama'],
                        ['kebutuhan', 'Keb'],
                        ['eksisting', 'Eks'],
                        ['selisih', 'Selisih'],
                        ['terisi', '% Terisi'],
                        ['diubah', 'Diubah'],
                      ] as [SortKey, string][]
                    ).map(([key, label]) => (
                      <th
                        key={key}
                        onClick={() => toggleSort(key)}
                        className="text-left px-2 py-1.5 cursor-pointer hover:text-slate-200 select-none"
                      >
                        <span className="flex items-center space-x-1">
                          <span>{label}</span>
                          {sortKey === key && <ArrowUpDown className="w-2.5 h-2.5" />}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {comparisonRows.map(row => (
                    <tr key={row.id} className="hover:bg-slate-800/30">
                      <td className="px-2 py-1 text-slate-200 truncate max-w-xs">{row.nama}</td>
                      <td className="px-2 py-1 text-slate-300">{row.kebutuhan}</td>
                      <td className="px-2 py-1 text-slate-300">{row.eksisting}</td>
                      <td className={`px-2 py-1 ${row.selisih < 0 ? 'text-red-400' : row.selisih > 0 ? 'text-amber-400' : 'text-slate-500'}`}>
                        {row.selisih > 0 ? `+${row.selisih}` : row.selisih}
                      </td>
                      <td className="px-2 py-1 text-slate-400">{row.terisi.toFixed(0)}%</td>
                      <td className="px-2 py-1 text-slate-500">{formatDate(row.diubah)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {showImport && (
        <ImportDialog
          onClose={() => {
            setShowImport(false);
            loadData();
          }}
          onImported={() => {
            setShowImport(false);
            onClose();
          }}
          onImportedBatch={() => {
            setShowImport(false);
            loadData();
          }}
        />
      )}
    </div>
  );
};
