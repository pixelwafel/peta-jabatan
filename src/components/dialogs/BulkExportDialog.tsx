import React, { useRef, useState } from 'react';
import { getProject } from '@/persistence/storage';
import { markProjectExported } from '@/persistence/reminder';
import { computeRecap } from '@/selectors/recap';
import { taxonomy } from '@/config/taxonomy';
import { exportXlsx } from '@/export/xlsxExporter';
import { exportJson } from '@/export/jsonExporter';
import { exportCsv } from '@/export/csvExporter';
import { exportFilename, slug } from '@/export/filename';
import { downloadBlob } from '@/utils/download';
import {
  Download,
  FileSpreadsheet,
  FileCode,
  FileText,
  X,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Archive,
} from 'lucide-react';

interface BulkExportDialogProps {
  selectedIds: string[];
  onClose: () => void;
}

type RowStatus = 'pending' | 'done' | 'error' | 'cancelled';

// Fase 2.4 — sama seperti selectors/globalBreakdown.ts & export/consolidatedExporter.ts:
// satu tick giliran event loop antar-project supaya loop N-OPD tidak jadi
// satu long task yang membekukan UI (drag, klik, dsb) selama proses berjalan.
function yieldToUi(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

interface RowResult {
  id: string;
  namaOPD: string;
  status: RowStatus;
  message?: string;
}

/**
 * Ekspor banyak OPD sekaligus jadi satu file .zip — tiap OPD tetap
 * menghasilkan berkas terpisah DI DALAM zip (tidak digabung jadi satu
 * dataset). Tidak ada opsi PNG di sini: exportPng() mengambil screenshot
 * DOM canvas React Flow yang sedang dirender + state proyek AKTIF, jadi
 * tidak bisa dipakai untuk OPD lain yang tidak sedang ditampilkan — PNG
 * tetap cuma lewat ExportDialog (ekspor satu OPD aktif).
 */
export const BulkExportDialog: React.FC<BulkExportDialogProps> = ({ selectedIds, onClose }) => {
  const [exportJsonSelected, setExportJsonSelected] = useState(true);
  const [exportXlsxSelected, setExportXlsxSelected] = useState(true);
  const [exportCsvSelected, setExportCsvSelected] = useState(false);
  const [csvDelimiter] = useState<',' | ';'>(',');

  const [isExporting, setIsExporting] = useState(false);
  const [results, setResults] = useState<RowResult[] | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const selectedCount = (exportJsonSelected ? 1 : 0) + (exportXlsxSelected ? 1 : 0) + (exportCsvSelected ? 1 : 0);

  const handleCancel = () => abortRef.current?.abort();

  const handleBulkExport = async () => {
    if (selectedCount === 0 || selectedIds.length === 0) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setIsExporting(true);
    setProgress({ done: 0, total: selectedIds.length });

    const rows: RowResult[] = selectedIds.map(id => ({ id, namaOPD: id, status: 'pending' }));
    setResults(rows);

    // Fase 1.8 — dynamic import: dialog ini sendiri sudah lazy-loaded, tapi
    // jszip cukup besar untuk dipisah lagi jadi chunk-nya sendiri, dimuat
    // hanya saat operator benar-benar menekan "Ekspor" (bukan saat dialog
    // dibuka).
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    // kodeOPD proyek baru/impor bisa kebetulan sama (mis. semua proyek kosong
    // baru berkode default sama) — kalau folder di dalam zip tidak dijamin
    // unik, OPD yang lebih belakangan akan MENIMPA berkas OPD sebelumnya di
    // path yang sama (kehilangan data secara diam-diam). Disambiguasi cuma
    // kalau memang bentrok, supaya nama folder tetap rapi di kasus umum.
    const usedFolders = new Set<string>();

    let done = 0;
    for (const id of selectedIds) {
      if (controller.signal.aborted) {
        setResults(prev => prev!.map(r => (r.id === id || r.status === 'pending' ? { ...r, status: 'cancelled' } : r)));
        break;
      }

      try {
        // `project` tidak disimpan ke array apa pun di luar iterasi ini —
        // sesudah ditambahkan ke zip (yang menyerap isinya sebagai
        // string/ArrayBuffer, bukan referensi objek), body project ini bebas
        // di-GC sebelum project berikutnya dibaca. N body tidak pernah
        // residen bersamaan.
        const project = await getProject(id);
        if (!project) {
          setResults(prev =>
            prev!.map(r => (r.id === id ? { ...r, status: 'error', message: 'Proyek tidak ditemukan' } : r))
          );
          continue;
        }

        const recap = computeRecap(project, taxonomy);
        let folder = slug(project.meta.kodeOPD) || slug(project.meta.namaOPD) || 'opd';
        if (usedFolders.has(folder)) {
          folder = `${folder}-${id.slice(0, 6)}`;
        }
        usedFolders.add(folder);

        if (exportJsonSelected) {
          zip.file(`${folder}/${exportFilename(project, 'json')}`, exportJson(project));
        }
        if (exportXlsxSelected) {
          zip.file(`${folder}/${exportFilename(project, 'xlsx')}`, await exportXlsx(project, recap));
        }
        if (exportCsvSelected) {
          zip.file(`${folder}/${exportFilename(project, 'csv')}`, exportCsv(project, recap, csvDelimiter));
        }

        await markProjectExported(id);
        setResults(prev =>
          prev!.map(r => (r.id === id ? { ...r, namaOPD: project.meta.namaOPD, status: 'done' } : r))
        );
      } catch (err) {
        console.error('Bulk export error for project', id, err);
        setResults(prev =>
          prev!.map(r => (r.id === id ? { ...r, status: 'error', message: 'Gagal diproses' } : r))
        );
      } finally {
        done++;
        setProgress({ done, total: selectedIds.length });
        if (done < selectedIds.length) await yieldToUi();
      }
    }

    const hasAnyFile = !controller.signal.aborted && zip.file(/.*/).length > 0;
    if (hasAnyFile) {
      const zipBlob = await zip.generateAsync({ type: 'blob', streamFiles: true });
      const date = new Date().toISOString().slice(0, 10);
      downloadBlob(zipBlob, `peta-jabatan_ekspor_${selectedIds.length}opd_${date}.zip`);
    }

    setIsExporting(false);
    setProgress(null);
    abortRef.current = null;
  };

  return (
    <div
      className="fixed inset-0 z-[60] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 select-none"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-w-md w-full flex flex-col text-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950/40">
          <div className="flex items-center space-x-2 font-semibold text-sm text-slate-100">
            <Archive className="w-4 h-4 text-blue-400" />
            <span>Ekspor {selectedIds.length} OPD ke ZIP</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4 text-xs">
          {!results && (
            <>
              <p className="text-slate-400">
                {selectedIds.length} OPD terpilih akan diekspor jadi satu file .zip — tiap OPD tetap
                jadi berkas terpisah di dalamnya (bukan digabung).
              </p>

              <div className="space-y-2">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                  Pilih Format Berkas
                </span>

                <label className="flex items-center justify-between p-2 rounded border border-slate-800 bg-slate-950/40 cursor-pointer hover:border-slate-700">
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={exportJsonSelected}
                      onChange={e => setExportJsonSelected(e.target.checked)}
                      className="rounded bg-slate-800 border-slate-700 text-blue-600 focus:ring-0"
                    />
                    <FileCode className="w-4 h-4 text-emerald-400" />
                    <span className="font-medium">JSON (.json)</span>
                  </div>
                </label>

                <label className="flex items-center justify-between p-2 rounded border border-slate-800 bg-slate-950/40 cursor-pointer hover:border-slate-700">
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={exportXlsxSelected}
                      onChange={e => setExportXlsxSelected(e.target.checked)}
                      className="rounded bg-slate-800 border-slate-700 text-blue-600 focus:ring-0"
                    />
                    <FileSpreadsheet className="w-4 h-4 text-green-400" />
                    <span className="font-medium">Excel (.xlsx)</span>
                  </div>
                </label>

                <label className="flex items-center justify-between p-2 rounded border border-slate-800 bg-slate-950/40 cursor-pointer hover:border-slate-700">
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={exportCsvSelected}
                      onChange={e => setExportCsvSelected(e.target.checked)}
                      className="rounded bg-slate-800 border-slate-700 text-blue-600 focus:ring-0"
                    />
                    <FileText className="w-4 h-4 text-blue-400" />
                    <span className="font-medium">CSV (.csv)</span>
                  </div>
                </label>
              </div>

              <p className="text-[11px] text-slate-500">
                Format PNG tidak tersedia di ekspor massal — PNG cuma bisa dibuat dari OPD yang
                sedang aktif/ditampilkan di kanvas (lewat tombol Ekspor biasa).
              </p>
            </>
          )}

          {results && (
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {results.map(r => (
                <div
                  key={r.id}
                  className="flex items-center justify-between px-2.5 py-1.5 rounded border border-slate-800 bg-slate-950/40"
                >
                  <span className="truncate text-slate-200">{r.namaOPD}</span>
                  {r.status === 'pending' && (
                    <RefreshCw className="w-3.5 h-3.5 text-slate-500 animate-spin flex-shrink-0" />
                  )}
                  {r.status === 'done' && (
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                  )}
                  {r.status === 'error' && (
                    <span className="flex items-center space-x-1 text-rose-400 flex-shrink-0">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span className="text-[11px]">{r.message}</span>
                    </span>
                  )}
                  {r.status === 'cancelled' && (
                    <span className="text-[11px] text-slate-500 flex-shrink-0">Dibatalkan</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end space-x-2 px-4 py-3 border-t border-slate-800 bg-slate-950/60">
          {isExporting ? (
            <>
              <span className="text-[11px] text-slate-400 mr-auto">
                {progress ? `Memproses ${progress.done}/${progress.total}...` : 'Menyiapkan...'}
              </span>
              <button
                onClick={handleCancel}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs"
              >
                Batalkan
              </button>
            </>
          ) : results ? (
            <button
              onClick={onClose}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-medium shadow-sm"
            >
              Tutup
            </button>
          ) : (
            <>
              <button
                onClick={onClose}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs"
              >
                Batal
              </button>
              <button
                disabled={selectedCount === 0}
                onClick={handleBulkExport}
                className="flex items-center space-x-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded text-xs font-medium shadow-sm"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Ekspor ke ZIP</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
