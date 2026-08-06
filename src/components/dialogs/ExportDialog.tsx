import React, { useState } from 'react';
import { useProjectStore } from '@/store/projectStore';
import { useRecap } from '@/selectors/recap';
import { exportFilename, laporanFilename } from '@/export/filename';
import { exportXlsx } from '@/export/xlsxExporter';
import { exportCsv } from '@/export/csvExporter';
import { exportJson } from '@/export/jsonExporter';
import { exportPng } from '@/export/pngExporter';
import { exportLaporan } from '@/export/laporanExporter';
import { markProjectExported } from '@/persistence/reminder';
import { downloadBlob } from '@/utils/download';
import {
  Download,
  FileSpreadsheet,
  FileCode,
  FileText,
  Image as ImageIcon,
  FileBarChart,
  X,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';

interface ExportDialogProps {
  onClose: () => void;
}

export const ExportDialog: React.FC<ExportDialogProps> = ({ onClose }) => {
  const project = useProjectStore(s => s.project);
  const renumberFromStructure = useProjectStore(s => s.renumberFromStructure);
  const recap = useRecap();

  const [exportJsonSelected, setExportJsonSelected] = useState(true);
  const [exportXlsxSelected, setExportXlsxSelected] = useState(true);
  const [exportCsvSelected, setExportCsvSelected] = useState(false);
  const [exportPngSelected, setExportPngSelected] = useState(true);
  // Default TIDAK dicentang — opt-in, supaya kebiasaan ekspor yang sudah ada
  // tidak mendadak menghasilkan file tambahan tak terduga (fitur "Laporan",
  // dibahas & disepakati dengan user, lihat export/laporanExporter.ts).
  const [exportLaporanSelected, setExportLaporanSelected] = useState(false);

  const [pngScale, setPngScale] = useState<number>(2);
  const [pngBg, setPngBg] = useState<'white' | 'transparent'>('white');
  const [csvDelimiter, setCsvDelimiter] = useState<',' | ';'>(',');
  const [isExporting, setIsExporting] = useState(false);

  if (!project || !recap) return null;

  const unnumberedNodes = project.nodes.filter(n => !n.nomor);
  const unplacedNodesCount = recap.unplaced.nodeCount;

  const selectedCount =
    (exportJsonSelected ? 1 : 0) +
    (exportXlsxSelected ? 1 : 0) +
    (exportCsvSelected ? 1 : 0) +
    (exportPngSelected ? 1 : 0) +
    (exportLaporanSelected ? 1 : 0);

  const handleExport = async () => {
    if (selectedCount === 0) return;
    setIsExporting(true);

    try {
      if (exportJsonSelected) {
        const jsonBlob = exportJson(project);
        downloadBlob(jsonBlob, exportFilename(project, 'json'));
        await new Promise(r => setTimeout(r, 200));
      }

      if (exportXlsxSelected) {
        const xlsxBlob = exportXlsx(project, recap);
        downloadBlob(xlsxBlob, exportFilename(project, 'xlsx'));
        await new Promise(r => setTimeout(r, 200));
      }

      if (exportCsvSelected) {
        const csvBlob = exportCsv(project, recap, csvDelimiter);
        downloadBlob(csvBlob, exportFilename(project, 'csv'));
        await new Promise(r => setTimeout(r, 200));
      }

      if (exportPngSelected) {
        const pngBlob = await exportPng({ background: pngBg, scale: pngScale });
        downloadBlob(pngBlob, exportFilename(project, 'png'));
      }

      if (exportLaporanSelected) {
        const laporanBlob = exportLaporan(project, recap);
        downloadBlob(laporanBlob, laporanFilename(project, 'xlsx'));
        await new Promise(r => setTimeout(r, 200));
      }

      await markProjectExported(project.id);
      onClose();
    } catch (err) {
      console.error('Export error:', err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 select-none"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-w-md w-full flex flex-col text-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950/40">
          <div className="flex items-center space-x-2 font-semibold text-sm text-slate-100">
            <Download className="w-4 h-4 text-blue-400" />
            <span>Ekspor Berkas Peta Jabatan</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4 text-xs">
          {/* Readiness warnings */}
          {unplacedNodesCount > 0 && (
            <div className="p-2.5 bg-amber-950/40 border border-amber-900/60 rounded-lg flex items-start space-x-2 text-amber-300">
              <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <span>
                {unplacedNodesCount} jabatan belum ditempatkan pada hirarki unit. Data tetap dapat diekspor.
              </span>
            </div>
          )}

          {/* Unnumbered prompt */}
          {unnumberedNodes.length > 0 && (
            <div className="p-2.5 bg-blue-950/40 border border-blue-900/60 rounded-lg flex items-center justify-between text-blue-300">
              <span>{unnumberedNodes.length} node belum bernomor.</span>
              <button
                onClick={renumberFromStructure}
                className="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-[11px] font-medium"
              >
                Auto Nomor
              </button>
            </div>
          )}

          {/* Export formats selection */}
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
              <span className="text-[11px] text-slate-500">Backup &amp; dibuka lagi</span>
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
              <span className="text-[11px] text-slate-500">Tabel &amp; penyuntingan</span>
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
              <span className="text-[11px] text-slate-500">Analisis data</span>
            </label>

            <label className="flex items-center justify-between p-2 rounded border border-slate-800 bg-slate-950/40 cursor-pointer hover:border-slate-700">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={exportPngSelected}
                  onChange={e => setExportPngSelected(e.target.checked)}
                  className="rounded bg-slate-800 border-slate-700 text-blue-600 focus:ring-0"
                />
                <ImageIcon className="w-4 h-4 text-purple-400" />
                <span className="font-medium">Gambar PNG (.png)</span>
              </div>
              <span className="text-[11px] text-slate-500">Gambar kanvas</span>
            </label>

            <label className="flex items-center justify-between p-2 rounded border border-slate-800 bg-slate-950/40 cursor-pointer hover:border-slate-700">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={exportLaporanSelected}
                  onChange={e => setExportLaporanSelected(e.target.checked)}
                  className="rounded bg-slate-800 border-slate-700 text-blue-600 focus:ring-0"
                />
                <FileBarChart className="w-4 h-4 text-amber-400" />
                <span className="font-medium">Laporan Ringkas (.xlsx)</span>
              </div>
              <span className="text-[11px] text-slate-500">Untuk pimpinan OPD</span>
            </label>
          </div>

          {/* Export options for PNG / CSV */}
          {exportPngSelected && (
            <div className="grid grid-cols-2 gap-2 p-2 bg-slate-950/40 border border-slate-800 rounded">
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 block">Skala PNG</label>
                <select
                  value={pngScale}
                  onChange={e => setPngScale(Number(e.target.value))}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs"
                >
                  <option value={1}>1× (Ukuran Layar)</option>
                  <option value={2}>2× (Rekomendasi Slide)</option>
                  <option value={3}>3× (Cetak Tinggi)</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 block">Latar PNG</label>
                <select
                  value={pngBg}
                  onChange={e => setPngBg(e.target.value as 'white' | 'transparent')}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs"
                >
                  <option value="white">Putih (White)</option>
                  <option value="transparent">Transparan</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end space-x-2 px-4 py-3 border-t border-slate-800 bg-slate-950/60">
          <button
            onClick={onClose}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs"
          >
            Batal
          </button>
          <button
            disabled={selectedCount === 0 || isExporting}
            onClick={handleExport}
            className="flex items-center space-x-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded text-xs font-medium shadow-sm"
          >
            {isExporting ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Mengekspor...</span>
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" />
                <span>Ekspor {selectedCount} Berkas</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
