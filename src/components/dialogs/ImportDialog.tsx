import React, { useState } from 'react';
import { processXlsxImport, ImportPreview } from '@/import/xlsxImporter';
import { importJsonFile } from '@/import/jsonImporter';
import { useProjectStore } from '@/store/projectStore';
import { useHistoryStore } from '@/store/historyStore';
import { computeLayout } from '@/utils/layout';
import { uuid } from '@/utils/uuid';
import { saveProject } from '@/persistence/storage';
import {
  Upload,
  FileSpreadsheet,
  FileCode,
  AlertCircle,
  AlertTriangle,
  Info,
  Download,
  X,
  CheckCircle,
} from 'lucide-react';

interface ImportDialogProps {
  onClose: () => void;
}

export const ImportDialog: React.FC<ImportDialogProps> = ({ onClose }) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const setProject = useProjectStore(s => s.setProject);
  const clearHistory = useHistoryStore(s => s.clear);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setIsLoading(true);

    try {
      if (file.name.endsWith('.json')) {
        const jsonRes = await importJsonFile(file);
        if (jsonRes.project) {
          const nodes = jsonRes.project.nodes;
          const edges = jsonRes.project.edges;
          const uCount = nodes.filter(n => n.type === 'unit').length;
          const jCount = nodes.filter(n => n.type === 'jabatan').length;
          const rCount = nodes.reduce((acc, n) => acc + n.rincian.length, 0);

          setPreview({
            summary: {
              nodeCount: nodes.length,
              unitCount: uCount,
              jabatanCount: jCount,
              rincianCount: rCount,
              totalKebutuhan: nodes.reduce(
                (acc, n) => acc + n.rincian.reduce((sum, r) => sum + r.kebutuhan, 0),
                0
              ),
              totalEksisting: nodes.reduce(
                (acc, n) => acc + n.rincian.reduce((sum, r) => sum + r.eksisting, 0),
                0
              ),
              rowsRead: nodes.length,
              rowsSkipped: 0,
            },
            findings: jsonRes.findings,
            sample: nodes.slice(0, 15).map(n => ({
              nomor: n.nomor,
              nama: n.nama,
              tipe: n.type === 'unit' ? 'Unit' : 'Jabatan',
              parent: '—',
            })),
            canCommit: true,
            built: { nodes, edges },
          });
        } else {
          setPreview({
            summary: {
              nodeCount: 0,
              unitCount: 0,
              jabatanCount: 0,
              rincianCount: 0,
              totalKebutuhan: 0,
              totalEksisting: 0,
              rowsRead: 0,
              rowsSkipped: 0,
            },
            findings: jsonRes.findings,
            sample: [],
            canCommit: false,
            built: { nodes: [], edges: [] },
          });
        }
      } else {
        const xlsxPreview = await processXlsxImport(file);
        setPreview(xlsxPreview);
      }
    } catch (err) {
      console.error('Import processing error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadFindingsCsv = () => {
    if (!preview) return;
    const lines = [
      'Keparahan,Kode,Baris,Pesan',
      ...preview.findings.map(
        f =>
          `"${f.severity}","${f.code}","${f.rowNumber ?? ''}","${f.message.replace(
            /"/g,
            '""'
          )}"`
      ),
    ];

    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `temuan_impor_${selectedFile?.name ?? 'file'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCommitImport = async () => {
    if (!preview || !preview.canCommit) return;

    const fileName = selectedFile?.name.replace(/\.[^/.]+$/, '') ?? 'Proyek Impor';
    const newProject = {
      id: uuid(),
      schemaVersion: '1.0.0',
      configVersion: '2026.1',
      meta: {
        namaOPD: fileName,
        kodeOPD: 'OPD.IMP',
        penyusun: 'Imported File',
        tahunAnggaran: new Date().getFullYear().toString(),
      },
      attributeSchema: [],
      nodes: preview.built.nodes,
      edges: preview.built.edges,
      viewport: { x: 0, y: 0, zoom: 1 },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Apply Dagre layout for XLSX imports where position is (0,0)
    const layout = computeLayout(newProject.nodes, newProject.edges, {
      direction: 'TB',
      scope: 'all',
    });

    for (const n of newProject.nodes) {
      const pos = layout.get(n.id);
      if (pos) n.position = pos;
    }

    await saveProject(newProject);
    setProject(newProject);
    clearHistory();
    onClose();
  };

  const errors = preview?.findings.filter(f => f.severity === 'error') ?? [];
  const warnings = preview?.findings.filter(f => f.severity === 'warning') ?? [];
  const infos = preview?.findings.filter(f => f.severity === 'info') ?? [];

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-w-2xl w-full flex flex-col max-h-[85vh] text-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950/40">
          <div className="flex items-center space-x-2 font-semibold text-sm text-slate-100">
            <Upload className="w-4 h-4 text-blue-400" />
            <span>Impor Berkas Peta Jabatan</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          {/* File Upload Selector */}
          {!selectedFile && (
            <div className="border-2 border-dashed border-slate-700 hover:border-blue-500/50 rounded-xl p-8 text-center space-y-3 bg-slate-950/20 transition-colors">
              <div className="flex justify-center space-x-2 text-slate-400">
                <FileSpreadsheet className="w-8 h-8 text-green-400" />
                <FileCode className="w-8 h-8 text-emerald-400" />
              </div>
              <div>
                <p className="font-semibold text-slate-200 text-sm">
                  Pilih berkas Excel (.xlsx) atau JSON (.json)
                </p>
                <p className="text-slate-500 text-xs mt-1">
                  Format template XLSX dengan hirarki nomor (1, 1.1, 1.1.1)
                </p>
              </div>
              <label className="inline-block px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded font-medium cursor-pointer transition-colors shadow-sm">
                <span>Pilih Berkas</span>
                <input
                  type="file"
                  accept=".xlsx,.xls,.json"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
            </div>
          )}

          {isLoading && (
            <div className="py-12 text-center text-slate-400 italic">
              Membaca dan memproses struktur data berkas...
            </div>
          )}

          {selectedFile && preview && !isLoading && (
            <div className="space-y-4">
              {/* File Info Header */}
              <div className="flex items-center justify-between p-3 bg-slate-950/60 border border-slate-800 rounded-lg">
                <div className="flex items-center space-x-2">
                  <FileSpreadsheet className="w-4 h-4 text-green-400" />
                  <span className="font-semibold text-slate-100">{selectedFile.name}</span>
                </div>
                <label className="text-blue-400 hover:text-blue-300 text-xs font-medium cursor-pointer">
                  Ganti Berkas
                  <input
                    type="file"
                    accept=".xlsx,.xls,.json"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Summary Stats */}
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="bg-slate-950/40 p-2 rounded border border-slate-800">
                  <span className="text-[10px] text-slate-500 block uppercase">Total Node</span>
                  <span className="font-bold text-slate-100 text-sm">{preview.summary.nodeCount}</span>
                  <span className="text-[10px] text-slate-400 block">
                    ({preview.summary.unitCount} Unit, {preview.summary.jabatanCount} Jabatan)
                  </span>
                </div>

                <div className="bg-slate-950/40 p-2 rounded border border-slate-800">
                  <span className="text-[10px] text-slate-500 block uppercase">Rincian Row</span>
                  <span className="font-bold text-slate-100 text-sm">{preview.summary.rincianCount}</span>
                </div>

                <div className="bg-slate-950/40 p-2 rounded border border-slate-800">
                  <span className="text-[10px] text-slate-500 block uppercase">Total Kebutuhan</span>
                  <span className="font-bold text-slate-100 text-sm">{preview.summary.totalKebutuhan}</span>
                </div>

                <div className="bg-slate-950/40 p-2 rounded border border-slate-800">
                  <span className="text-[10px] text-slate-500 block uppercase">Total Eksisting</span>
                  <span className="font-bold text-slate-100 text-sm">{preview.summary.totalEksisting}</span>
                </div>
              </div>

              {/* Findings Section */}
              {preview.findings.length > 0 && (
                <div className="space-y-2 border border-slate-800 rounded-lg p-3 bg-slate-950/30">
                  <div className="flex items-center justify-between pb-1 border-b border-slate-800/80">
                    <span className="font-semibold text-slate-300">
                      Temuan Impor ({preview.findings.length})
                    </span>
                    <button
                      onClick={handleDownloadFindingsCsv}
                      className="flex items-center space-x-1 text-[11px] text-blue-400 hover:text-blue-300"
                    >
                      <Download className="w-3 h-3" />
                      <span>Unduh Temuan (CSV)</span>
                    </button>
                  </div>

                  <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                    {errors.map((f, i) => (
                      <div key={i} className="flex items-start space-x-1.5 text-rose-400 font-mono">
                        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                        <span>{f.message}</span>
                      </div>
                    ))}
                    {warnings.map((f, i) => (
                      <div key={i} className="flex items-start space-x-1.5 text-amber-400 font-mono">
                        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                        <span>{f.message}</span>
                      </div>
                    ))}
                    {infos.map((f, i) => (
                      <div key={i} className="flex items-start space-x-1.5 text-blue-400 font-mono">
                        <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                        <span>{f.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Sample Table */}
              {preview.sample.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                    Sampel Hirarki Node Parsed (15 Pertama)
                  </span>
                  <div className="border border-slate-800 rounded overflow-hidden bg-slate-950/40 font-mono">
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="bg-slate-900 border-b border-slate-800 text-slate-400">
                          <th className="py-1 px-2 text-left w-16">Nomor</th>
                          <th className="py-1 px-2 text-left">Nama</th>
                          <th className="py-1 px-2 text-left w-16">Tipe</th>
                          <th className="py-1 px-2 text-left">Induk</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {preview.sample.map((s, idx) => (
                          <tr key={idx} className="hover:bg-slate-800/40">
                            <td className="py-1 px-2 text-blue-300">{s.nomor}</td>
                            <td className="py-1 px-2 text-slate-200 truncate">{s.nama}</td>
                            <td className="py-1 px-2 text-slate-400">{s.tipe}</td>
                            <td className="py-1 px-2 text-slate-400 truncate">{s.parent}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
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
            disabled={!preview || !preview.canCommit}
            onClick={handleCommitImport}
            className="flex items-center space-x-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded text-xs font-medium shadow-sm"
          >
            <CheckCircle className="w-3.5 h-3.5" />
            <span>Impor ke Proyek Baru</span>
          </button>
        </div>
      </div>
    </div>
  );
};
