import React, { useState, useEffect, useMemo } from 'react';
import { processXlsxImport, ImportPreview } from '@/import/xlsxImporter';
import { importJsonFile, JsonImportResult } from '@/import/jsonImporter';
import { buildImportedProject } from '@/import/buildImportedProject';
import { classifyBatch, ParsedFile, StagedEntry, StagingStatus } from '@/import/bulkStaging';
import { commitBulkImport, rollbackBulkImport, archiveProject, BulkCommitItem } from '@/persistence/bulkImport';
import { useProjectStore } from '@/store/projectStore';
import { useUiStore } from '@/store/uiStore';
import { uuid } from '@/utils/uuid';
import { saveProject, getProjectIndex } from '@/persistence/storage';
import { ProjectIndex } from '@/persistence/types';
import { Project } from '@/models/project';
import { exportXlsxTemplate } from '@/export/xlsxExporter';
import { Finding } from '@/models/derived';
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
  Loader2,
  Trash2,
  Plus,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';

interface ImportDialogProps {
  onClose: () => void;
  /** Dipanggil setelah SATU-satunya berkas di antrian berhasil di-commit —
   *  menutup ImportDialog SEKALIGUS dialog induknya (Kelola Proyek) dan
   *  langsung navigasi ke outline proyek baru. Sama seperti perilaku lama,
   *  cuma dipicu kalau antrian persis 1 berkas. */
  onImported: () => void;
  /** Dipanggil setelah commit-semua untuk antrian MULTI-berkas (≥2). Beda
   *  dari onImported: cuma menutup ImportDialog & me-refresh daftar proyek
   *  di dialog induk — parent tetap terbuka supaya user memilih sendiri OPD
   *  mana yang mau dibuka (tidak ada satu proyek pun yang "menang" jadi
   *  aktif secara otomatis). */
  onImportedBatch: () => void;
}

type QueueStatus = 'parsing' | 'ready' | 'error' | 'committed';

interface QueuedImport {
  clientId: string;
  file: File;
  status: QueueStatus;
  preview: ImportPreview | null;
  errorMessage?: string;
}

function splitFindings(findings: Finding[]) {
  return {
    errors: findings.filter(f => f.severity === 'error'),
    warnings: findings.filter(f => f.severity === 'warning'),
    infos: findings.filter(f => f.severity === 'info'),
  };
}

/** Bungkus hasil importJsonFile ke shape ImportPreview yang sama dipakai XLSX,
 *  supaya seluruh UI (findings, summary, sample) tidak perlu tahu asal file. */
function jsonResultToPreview(jsonRes: JsonImportResult): ImportPreview {
  if (!jsonRes.project) {
    return {
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
    };
  }

  const { nodes, edges } = jsonRes.project;
  const uCount = nodes.filter(n => n.type === 'unit').length;
  const jCount = nodes.filter(n => n.type === 'jabatan').length;
  const rCount = nodes.reduce((acc, n) => acc + n.rincian.length, 0);

  return {
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
    built: { nodes, edges, instances: jsonRes.project.instances },
    // JSON membawa Project lengkap — kodeOPD/updatedAt ASLI dipakai buat
    // staging bulk import (doc 14 §4), bukan turunan nama file.
    sourceMeta: {
      namaOPD: jsonRes.project.meta.namaOPD,
      kodeOPD: jsonRes.project.meta.kodeOPD,
      updatedAt: jsonRes.project.updatedAt,
    },
  };
}

const ACCEPT_RE = /\.(xlsx|xls|json)$/i;

interface FindingsBlockProps {
  findings: Finding[];
  onDownloadCsv: () => void;
}

const FindingsBlock: React.FC<FindingsBlockProps> = ({ findings, onDownloadCsv }) => {
  if (findings.length === 0) return null;
  const { errors, warnings, infos } = splitFindings(findings);

  return (
    <div className="space-y-2 border border-slate-800 rounded-lg p-3 bg-slate-950/30">
      <div className="flex items-center justify-between pb-1 border-b border-slate-800/80">
        <span className="font-semibold text-slate-300">Temuan Impor ({findings.length})</span>
        <button
          onClick={onDownloadCsv}
          className="flex items-center space-x-1 text-[11px] text-blue-400 hover:text-blue-300"
        >
          <Download className="w-3 h-3" />
          <span>Unduh Temuan (CSV)</span>
        </button>
      </div>

      <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
        {errors.map((f, i) => (
          <div key={`e${i}`} className="flex items-start space-x-1.5 text-rose-400 font-mono">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span>{f.message}</span>
          </div>
        ))}
        {warnings.map((f, i) => (
          <div key={`w${i}`} className="flex items-start space-x-1.5 text-amber-400 font-mono">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span>{f.message}</span>
          </div>
        ))}
        {infos.map((f, i) => (
          <div key={`i${i}`} className="flex items-start space-x-1.5 text-blue-400 font-mono">
            <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span>{f.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const SummaryGrid: React.FC<{ summary: ImportPreview['summary'] }> = ({ summary }) => (
  <div className="grid grid-cols-4 gap-2 text-center">
    <div className="bg-slate-950/40 p-2 rounded border border-slate-800">
      <span className="text-[10px] text-slate-500 block uppercase">Total Node</span>
      <span className="font-bold text-slate-100 text-sm">{summary.nodeCount}</span>
      <span className="text-[10px] text-slate-400 block">
        ({summary.unitCount} Unit, {summary.jabatanCount} Jabatan)
      </span>
    </div>
    <div className="bg-slate-950/40 p-2 rounded border border-slate-800">
      <span className="text-[10px] text-slate-500 block uppercase">Rincian Row</span>
      <span className="font-bold text-slate-100 text-sm">{summary.rincianCount}</span>
    </div>
    <div className="bg-slate-950/40 p-2 rounded border border-slate-800">
      <span className="text-[10px] text-slate-500 block uppercase">Total Kebutuhan</span>
      <span className="font-bold text-slate-100 text-sm">{summary.totalKebutuhan}</span>
    </div>
    <div className="bg-slate-950/40 p-2 rounded border border-slate-800">
      <span className="text-[10px] text-slate-500 block uppercase">Total Eksisting</span>
      <span className="font-bold text-slate-100 text-sm">{summary.totalEksisting}</span>
    </div>
  </div>
);

const SampleTable: React.FC<{ sample: ImportPreview['sample'] }> = ({ sample }) => {
  if (sample.length === 0) return null;
  return (
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
            {sample.map((s, idx) => (
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
  );
};

function downloadFindingsCsv(fileName: string, findings: Finding[]) {
  const lines = [
    'Keparahan,Kode,Baris,Pesan',
    ...findings.map(
      f =>
        `"${f.severity}","${f.code}","${f.rowNumber ?? ''}","${f.message.replace(/"/g, '""')}"`
    ),
  ];
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `temuan_impor_${fileName}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export const ImportDialog: React.FC<ImportDialogProps> = ({ onClose, onImported, onImportedBatch }) => {
  const [queue, setQueue] = useState<QueuedImport[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isCommitting, setIsCommitting] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [batchResult, setBatchResult] = useState<{ committed: number; skipped: number } | null>(null);
  const [rollbackKeys, setRollbackKeys] = useState<string[] | null>(null);
  const [storedIndex, setStoredIndex] = useState<ProjectIndex | null>(null);

  const setProject = useProjectStore(s => s.setProject);
  const showToast = useUiStore(s => s.showToast);

  // Snapshot index sekali saat dialog dibuka — dipakai staging batch (doc 14
  // §4: new/replace/older diputuskan lewat kodeOPD terhadap yang tersimpan).
  useEffect(() => {
    getProjectIndex().then(setStoredIndex);
  }, []);

  const parseEntry = async (clientId: string, file: File) => {
    try {
      const preview = file.name.toLowerCase().endsWith('.json')
        ? jsonResultToPreview(await importJsonFile(file))
        : await processXlsxImport(file);
      setQueue(prev =>
        prev.map(q => (q.clientId === clientId ? { ...q, status: 'ready', preview } : q))
      );
    } catch (err) {
      console.error('Import processing error:', err);
      setQueue(prev =>
        prev.map(q =>
          q.clientId === clientId
            ? { ...q, status: 'error', errorMessage: 'Gagal membaca berkas.' }
            : q
        )
      );
    }
  };

  const addFiles = (files: FileList | File[]) => {
    const all = Array.from(files);
    const accepted = all.filter(f => ACCEPT_RE.test(f.name));
    const rejectedCount = all.length - accepted.length;
    if (rejectedCount > 0) {
      showToast(`${rejectedCount} berkas diabaikan (bukan .xlsx/.json).`);
    }
    if (accepted.length === 0) return;

    const entries: QueuedImport[] = accepted.map(file => ({
      clientId: uuid(),
      file,
      status: 'parsing',
      preview: null,
    }));
    setQueue(prev => [...prev, ...entries]);
    setBatchResult(null);

    for (const entry of entries) {
      parseEntry(entry.clientId, entry.file);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(e.target.files);
    e.target.value = ''; // supaya memilih berkas yang sama lagi tetap memicu onChange
  };

  const removeEntry = (clientId: string) => {
    setQueue(prev => prev.filter(q => q.clientId !== clientId));
  };

  const commitOne = async (entry: QueuedImport) => {
    if (!entry.preview || !entry.preview.canCommit) return null;
    const fileName = entry.file.name.replace(/\.[^/.]+$/, '');
    const project = buildImportedProject(entry.preview, fileName);

    // Baris "Impor" per-item di antrian multi-berkas ikut hormati staging
    // (doc 14 §4): kalau statusnya 'replace', timpa project yang sudah ada
    // (dengan arsip satu generasi), bukan bikin project baru terpisah.
    const staged = stagedByClientId.get(entry.clientId);
    if (staged?.status === 'replace' && staged.existingId) {
      project.id = staged.existingId;
      await archiveProject(staged.existingId);
    }

    await saveProject(project);
    setQueue(prev =>
      prev.map(q => (q.clientId === entry.clientId ? { ...q, status: 'committed' } : q))
    );
    return project;
  };

  /** Commit satu baris saja dari antrian campuran — tidak pernah auto-navigate,
   *  cuma menyimpan & menandai baris itu selesai (dipakai kalau queue ≥2). */
  const handleCommitRow = async (entry: QueuedImport) => {
    const project = await commitOne(entry);
    if (project) {
      showToast(`Proyek "${project.meta.namaOPD}" berhasil diimpor.`);
    }
  };

  const commitableEntries = queue.filter(q => q.status === 'ready' && q.preview?.canCommit);

  // Staging (docs/14-recap-dashboard.md §4) — cuma relevan untuk antrian
  // multi-berkas; antrian 1 berkas tetap pakai jalur lama tanpa staging.
  const stagedByClientId = useMemo(() => {
    const map = new Map<string, StagedEntry>();
    if (queue.length <= 1 || !storedIndex) return map;

    const parsedFiles: ParsedFile[] = queue
      .filter(q => q.status === 'ready')
      .map(q => ({
        clientId: q.clientId,
        fileName: q.file.name,
        project: q.preview?.canCommit
          ? buildImportedProject(q.preview, q.file.name.replace(/\.[^/.]+$/, ''))
          : null,
        parseFailed: !q.preview?.canCommit,
      }));

    for (const s of classifyBatch(parsedFiles, storedIndex)) {
      map.set(s.clientId, s);
    }
    return map;
  }, [queue, storedIndex]);

  const stagingLabel: Record<StagingStatus, string> = {
    new: 'Baru',
    replace: 'Ganti (versi lama diarsipkan)',
    older: 'Lebih lama — dilewati',
    'duplicate-in-batch': 'Duplikat di batch — dilewati',
    invalid: 'Tidak valid',
  };

  const handleCommitAll = async () => {
    if (commitableEntries.length === 0) return;
    setIsCommitting(true);

    try {
      if (queue.length === 1) {
        // Antrian persis 1 berkas — perilaku lama dipertahankan persis:
        // jadi proyek aktif & langsung navigasi ke outline.
        const project = await commitOne(queue[0]);
        if (project) {
          setProject(project);
          showToast(`Proyek "${project.meta.namaOPD}" berhasil diimpor (${project.nodes.length} node).`);
          onImported();
        }
        return;
      }

      // Multi-berkas: two-phase commit (doc 14 §4.1) — cuma status
      // 'new'/'replace' yang benar-benar ditulis; 'older'/'duplicate-in-batch'/
      // 'invalid' dilewati (tetap kelihatan statusnya di baris masing-masing).
      const items: BulkCommitItem[] = [];
      const projectRefToClientId = new Map<Project, string>();

      for (const [clientId, staged] of stagedByClientId.entries()) {
        if (!staged.project) continue;
        if (staged.status === 'new') {
          items.push({ project: staged.project, isReplace: false });
          projectRefToClientId.set(staged.project, clientId);
        } else if (staged.status === 'replace' && staged.existingId) {
          const replaced = { ...staged.project, id: staged.existingId };
          items.push({ project: replaced, isReplace: true });
          projectRefToClientId.set(replaced, clientId);
        }
      }

      const result = await commitBulkImport(items);
      const skipped = queue.length - result.committedProjects.length;

      if (result.failed.length > 0) {
        // Sebagian gagal di Fase 1 — beri opsi rollback (doc 14 §4.1 poin 2)
        // alih-alih diam-diam meninggalkan index & body tidak sinkron.
        setRollbackKeys(result.writtenKeys);
      }

      setBatchResult({ committed: result.committedProjects.length, skipped });

      const committedClientIds = new Set(
        result.committedProjects.map(p => projectRefToClientId.get(p)).filter(Boolean)
      );
      setQueue(prev =>
        prev.map(q => (committedClientIds.has(q.clientId) ? { ...q, status: 'committed' } : q))
      );
    } finally {
      setIsCommitting(false);
    }
  };

  const handleRollback = async () => {
    if (!rollbackKeys) return;
    await rollbackBulkImport(rollbackKeys);
    setRollbackKeys(null);
    setBatchResult(null);
    showToast('Batch dibatalkan — berkas yang sempat tertulis sudah dihapus.', 'error');
  };

  const handleDownloadTemplate = () => {
    const blob = exportXlsxTemplate();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'template_peta_jabatan.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
  };

  const statusLabel = (status: QueueStatus) =>
    status === 'parsing'
      ? 'Memproses...'
      : status === 'error'
      ? 'Gagal dibaca'
      : status === 'committed'
      ? 'Sudah diimpor'
      : 'Siap diimpor';

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 select-none"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
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
        <div
          className="flex-1 overflow-y-auto p-4 space-y-4 text-xs"
          onDragOver={e => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
        >
          {batchResult && (
            <div
              className={`p-3 rounded-lg border flex items-center justify-between space-x-2 ${
                rollbackKeys
                  ? 'bg-rose-950/30 border-rose-900/60 text-rose-300'
                  : batchResult.skipped === 0
                  ? 'bg-emerald-950/30 border-emerald-900/60 text-emerald-300'
                  : 'bg-amber-950/30 border-amber-900/60 text-amber-300'
              }`}
            >
              <span className="flex items-center space-x-2">
                <CheckCircle className="w-4 h-4 flex-shrink-0" />
                <span>
                  {batchResult.committed} proyek berhasil ditulis
                  {batchResult.skipped > 0
                    ? `, ${batchResult.skipped} dilewati (lihat status per berkas di bawah)`
                    : '.'}
                  {rollbackKeys && ' — sebagian gagal ditulis ke penyimpanan.'}
                </span>
              </span>
              {rollbackKeys && (
                <button
                  onClick={handleRollback}
                  className="flex items-center space-x-1 px-2.5 py-1 bg-rose-800 hover:bg-rose-700 text-white rounded text-[11px] font-medium flex-shrink-0"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Batalkan Semua (Rollback)</span>
                </button>
              )}
            </div>
          )}

          {/* Dropzone — selalu ada, tapi tampilannya besar cuma saat antrian kosong */}
          {queue.length === 0 ? (
            <div
              className={`border-2 border-dashed rounded-xl p-8 text-center space-y-3 bg-slate-950/20 transition-colors ${
                isDragOver ? 'border-blue-500 bg-blue-950/10' : 'border-slate-700 hover:border-blue-500/50'
              }`}
            >
              <div className="flex justify-center space-x-2 text-slate-400">
                <FileSpreadsheet className="w-8 h-8 text-green-400" />
                <FileCode className="w-8 h-8 text-emerald-400" />
              </div>
              <div>
                <p className="font-semibold text-slate-200 text-sm">
                  Pilih atau tarik beberapa berkas Excel (.xlsx) / JSON (.json) sekaligus
                </p>
                <p className="text-slate-500 text-xs mt-1">
                  Tiap berkas tetap jadi satu proyek OPD terpisah — format template XLSX dengan
                  hirarki nomor (1, 1.1, 1.1.1)
                </p>
              </div>
              <div className="flex items-center justify-center gap-2">
                <label className="inline-block px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded font-medium cursor-pointer transition-colors shadow-sm">
                  <span>Pilih Berkas</span>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.json"
                    multiple
                    onChange={handleFileInput}
                    className="hidden"
                  />
                </label>
                <button
                  onClick={handleDownloadTemplate}
                  className="flex items-center space-x-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded font-medium border border-slate-700 transition-colors"
                  title="Unduh template XLSX kosong (contoh + petunjuk pengisian + referensi kategori/jenjang)"
                >
                  <Download className="w-3.5 h-3.5 text-blue-400" />
                  <span>Unduh Template</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              <div
                className={`flex items-center justify-between px-3 py-2 rounded-lg border ${
                  isDragOver
                    ? 'border-blue-500 bg-blue-950/10'
                    : 'border-dashed border-slate-700 bg-slate-950/20'
                }`}
              >
                <span className="text-slate-400">
                  {queue.length} berkas di antrian — tarik berkas lain ke sini kapan saja
                </span>
                <label className="flex items-center space-x-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded cursor-pointer border border-slate-700">
                  <Plus className="w-3 h-3 text-blue-400" />
                  <span>Tambah Berkas</span>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.json"
                    multiple
                    onChange={handleFileInput}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Antrian tunggal (1 berkas) — tampilkan panel detail penuh langsung,
                  persis pengalaman lama, tidak perlu expand/collapse. */}
              {queue.length === 1 &&
                (() => {
                  const entry = queue[0];
                  return (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-3 bg-slate-950/60 border border-slate-800 rounded-lg">
                        <div className="flex items-center space-x-2">
                          {entry.status === 'parsing' ? (
                            <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                          ) : (
                            <FileSpreadsheet className="w-4 h-4 text-green-400" />
                          )}
                          <span className="font-semibold text-slate-100">{entry.file.name}</span>
                        </div>
                        <button
                          onClick={() => removeEntry(entry.clientId)}
                          className="text-rose-400 hover:text-rose-300 text-xs font-medium"
                        >
                          Hapus
                        </button>
                      </div>

                      {entry.status === 'parsing' && (
                        <div className="py-12 text-center text-slate-400 italic">
                          Membaca dan memproses struktur data berkas...
                        </div>
                      )}

                      {entry.preview && entry.status !== 'parsing' && (
                        <>
                          <SummaryGrid summary={entry.preview.summary} />
                          <FindingsBlock
                            findings={entry.preview.findings}
                            onDownloadCsv={() => downloadFindingsCsv(entry.file.name, entry.preview!.findings)}
                          />
                          <SampleTable sample={entry.preview.sample} />
                        </>
                      )}
                    </div>
                  );
                })()}

              {/* Antrian multi-berkas — daftar ringkas, expand per baris untuk detail. */}
              {queue.length > 1 && (
                <div className="space-y-1.5">
                  {queue.map(entry => {
                    const isExpanded = expandedId === entry.clientId;
                    const findingsCount = entry.preview?.findings.length ?? 0;
                    const hasError = entry.status === 'error' || (entry.preview && !entry.preview.canCommit);

                    return (
                      <div key={entry.clientId} className="border border-slate-800 rounded-lg bg-slate-950/30 overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-2">
                          <button
                            className="flex items-center space-x-2 min-w-0 flex-1 text-left"
                            onClick={() =>
                              setExpandedId(isExpanded ? null : entry.clientId)
                            }
                            disabled={!entry.preview}
                          >
                            {entry.preview ? (
                              isExpanded ? (
                                <ChevronDown className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                              )
                            ) : (
                              <span className="w-3.5 h-3.5 flex-shrink-0" />
                            )}
                            {entry.status === 'parsing' ? (
                              <Loader2 className="w-4 h-4 text-blue-400 animate-spin flex-shrink-0" />
                            ) : entry.status === 'committed' ? (
                              <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                            ) : hasError ? (
                              <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                            ) : (
                              <FileSpreadsheet className="w-4 h-4 text-green-400 flex-shrink-0" />
                            )}
                            <span className="truncate font-medium text-slate-200">{entry.file.name}</span>
                          </button>

                          <div className="flex items-center space-x-3 flex-shrink-0 pl-2">
                            {(() => {
                              const staged = stagedByClientId.get(entry.clientId);
                              if (!staged || entry.status !== 'ready') return null;
                              const colorClass =
                                staged.status === 'invalid' || staged.status === 'duplicate-in-batch'
                                  ? 'text-rose-400'
                                  : staged.status === 'older'
                                  ? 'text-amber-400'
                                  : staged.status === 'replace'
                                  ? 'text-blue-400'
                                  : 'text-emerald-400';
                              return (
                                <span className={`text-[10px] font-medium ${colorClass}`} title={staged.message}>
                                  {stagingLabel[staged.status]}
                                </span>
                              );
                            })()}
                            <span
                              className={`text-[11px] ${
                                hasError
                                  ? 'text-rose-400'
                                  : entry.status === 'committed'
                                  ? 'text-emerald-400'
                                  : 'text-slate-500'
                              }`}
                            >
                              {entry.status === 'ready' && entry.preview
                                ? `${entry.preview.summary.nodeCount} node${
                                    findingsCount > 0 ? ` · ${findingsCount} temuan` : ''
                                  }`
                                : statusLabel(entry.status)}
                            </span>
                            {entry.status === 'ready' && entry.preview?.canCommit && (
                              <button
                                onClick={() => handleCommitRow(entry)}
                                className="text-blue-400 hover:text-blue-300 font-medium"
                              >
                                Impor
                              </button>
                            )}
                            {entry.status !== 'committed' && (
                              <button
                                onClick={() => removeEntry(entry.clientId)}
                                className="text-slate-500 hover:text-rose-400"
                                title="Hapus dari antrian"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        {isExpanded && entry.preview && (
                          <div className="px-3 pb-3 space-y-3 border-t border-slate-800/80 pt-3">
                            <SummaryGrid summary={entry.preview.summary} />
                            <FindingsBlock
                              findings={entry.preview.findings}
                              onDownloadCsv={() =>
                                downloadFindingsCsv(entry.file.name, entry.preview!.findings)
                              }
                            />
                            <SampleTable sample={entry.preview.sample} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end space-x-2 px-4 py-3 border-t border-slate-800 bg-slate-950/60">
          {batchResult ? (
            <button
              onClick={onImportedBatch}
              className="flex items-center space-x-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-medium shadow-sm"
            >
              <CheckCircle className="w-3.5 h-3.5" />
              <span>Selesai — Lihat Daftar OPD</span>
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
                disabled={commitableEntries.length === 0 || isCommitting}
                onClick={handleCommitAll}
                className="flex items-center space-x-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded text-xs font-medium shadow-sm"
              >
                {isCommitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Mengimpor...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>
                      {queue.length > 1
                        ? `Impor Semua yang Valid (${commitableEntries.length})`
                        : 'Impor ke Proyek Baru'}
                    </span>
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
