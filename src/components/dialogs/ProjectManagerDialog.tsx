import React, { useState, useEffect, useMemo } from 'react';
import { ProjectIndex, ProjectIndexEntry } from '@/persistence/types';
import {
  getProjectIndex,
  getProject,
  saveProject,
  deleteProjectData,
  estimateStorageUsage,
} from '@/persistence/storage';
import { useProjectStore } from '@/store/projectStore';
import { useUiStore } from '@/store/uiStore';
import { uuid } from '@/utils/uuid';
import { buildBlankProject } from '@/persistence/blankProject';
import { ImportDialog } from './ImportDialog';
import { BulkExportDialog } from './BulkExportDialog';
import {
  Folder,
  Plus,
  Trash2,
  Copy,
  CheckCircle2,
  Search,
  HardDrive,
  X,
  AlertTriangle,
  Upload,
  Download,
} from 'lucide-react';

interface ProjectManagerDialogProps {
  onClose: () => void;
}

export const ProjectManagerDialog: React.FC<ProjectManagerDialogProps> = ({ onClose }) => {
  const [index, setIndex] = useState<ProjectIndex | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [selectedForExport, setSelectedForExport] = useState<Set<string>>(new Set());
  const [showBulkExport, setShowBulkExport] = useState(false);

  const [storageUsage, setStorageUsage] = useState<{
    usedBytes: number;
    quotaBytes: number;
    percentUsed: number;
  }>({ usedBytes: 0, quotaBytes: 50 * 1024 * 1024, percentUsed: 0 });

  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<ProjectIndexEntry | null>(
    null
  );
  const [typedNameInput, setTypedNameInput] = useState('');

  const currentProject = useProjectStore(s => s.project);
  const setProject = useProjectStore(s => s.setProject);
  const openConfirm = useUiStore(s => s.openConfirm);

  const loadData = async () => {
    const idx = await getProjectIndex();
    setIndex(idx);
    const usage = await estimateStorageUsage();
    setStorageUsage(usage);
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredEntries = useMemo(() => {
    if (!index) return [];
    if (!searchTerm.trim()) return index.entries;
    const term = searchTerm.toLowerCase();
    return index.entries.filter(
      e =>
        e.namaOPD.toLowerCase().includes(term) ||
        e.kodeOPD.toLowerCase().includes(term)
    );
  }, [index, searchTerm]);

  const handleCreateNew = async () => {
    const newProject = buildBlankProject();
    await saveProject(newProject);
    setProject(newProject);
    onClose();
  };

  const handleSwitchProject = async (targetId: string) => {
    if (targetId === currentProject?.id) {
      onClose();
      return;
    }

    const p = await getProject(targetId);
    if (p) {
      setProject(p);
      onClose();
    }
  };

  const handleDuplicate = async (entry: ProjectIndexEntry) => {
    const original = await getProject(entry.id);
    if (!original) return;

    const newId = uuid();
    const copyProject = {
      ...structuredClone(original),
      id: newId,
      meta: {
        ...original.meta,
        namaOPD: `${original.meta.namaOPD} — Salinan`,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await saveProject(copyProject);
    await loadData();
  };

  const initiateDelete = (entry: ProjectIndexEntry) => {
    if (!entry.lastExportedAt) {
      setDeleteConfirmTarget(entry);
      setTypedNameInput('');
    } else {
      openConfirm({
        title: `Hapus Proyek ${entry.namaOPD}?`,
        body: `Proyek ini memiliki ${entry.nodeCount} node dan terakhir diekspor pada ${new Date(
          entry.lastExportedAt
        ).toLocaleTimeString()}. Tindakan ini tidak dapat dibatalkan.`,
        confirmLabel: 'Hapus Proyek',
        danger: true,
        onConfirm: async () => {
          await deleteProjectData(entry.id);
          if (currentProject?.id === entry.id) {
            setProject(null);
          }
          await loadData();
        },
      });
    }
  };

  const handleConfirmedTypedDelete = async () => {
    if (!deleteConfirmTarget) return;
    if (typedNameInput.trim() !== deleteConfirmTarget.namaOPD.trim()) return;

    await deleteProjectData(deleteConfirmTarget.id);
    if (currentProject?.id === deleteConfirmTarget.id) {
      setProject(null);
    }
    setDeleteConfirmTarget(null);
    setTypedNameInput('');
    await loadData();
  };

  const formatBytes = (bytes: number) => {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  const toggleSelected = (id: string) => {
    setSelectedForExport(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allFilteredSelected =
    filteredEntries.length > 0 && filteredEntries.every(e => selectedForExport.has(e.id));

  const toggleSelectAll = () => {
    setSelectedForExport(prev => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        for (const e of filteredEntries) next.delete(e.id);
      } else {
        for (const e of filteredEntries) next.add(e.id);
      }
      return next;
    });
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 select-none"
        onClick={e => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-w-2xl w-full flex flex-col max-h-[85vh] overflow-hidden text-slate-200">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950/40">
            <div className="flex items-center space-x-2 font-semibold text-sm text-slate-100">
              <Folder className="w-4 h-4 text-blue-400" />
              <span>Kelola Proyek Peta Jabatan</span>
            </div>
            <button
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Toolbar & Search */}
          <div className="p-4 border-b border-slate-800/80 bg-slate-950/20 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center space-x-2">
                <button
                  onClick={handleCreateNew}
                  className="flex items-center space-x-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Proyek Baru</span>
                </button>
                <button
                  onClick={() => setShowImportDialog(true)}
                  className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded border border-slate-700"
                >
                  <Upload className="w-3.5 h-3.5 text-blue-400" />
                  <span>Impor Berkas</span>
                </button>
              </div>

              <div className="relative flex-1 max-w-xs">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-500" />
                <input
                  type="text"
                  placeholder="Cari nama atau kode OPD..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-slate-100 rounded pl-8 pr-2 py-1 text-xs outline-none focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Bulk export selection bar */}
          {filteredEntries.length > 0 && (
            <div className="flex items-center justify-between px-4 pt-3 -mb-1">
              <label className="flex items-center space-x-2 text-[11px] text-slate-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  onChange={toggleSelectAll}
                  className="rounded bg-slate-800 border-slate-700 text-blue-600 focus:ring-0"
                />
                <span>Pilih Semua ({filteredEntries.length})</span>
              </label>
              {selectedForExport.size > 0 && (
                <button
                  onClick={() => setShowBulkExport(true)}
                  className="flex items-center space-x-1.5 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-medium shadow-sm"
                >
                  <Download className="w-3 h-3" />
                  <span>Ekspor Terpilih ({selectedForExport.size})</span>
                </button>
              )}
            </div>
          )}

          {/* Project List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
            {filteredEntries.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-xs italic">
                Tidak ada proyek ditemukan.
              </div>
            ) : (
              filteredEntries.map(entry => {
                const isActive = currentProject?.id === entry.id;
                const isUnexported =
                  !entry.lastExportedAt ||
                  Date.parse(entry.updatedAt) > Date.parse(entry.lastExportedAt);

                return (
                  <div
                    key={entry.id}
                    className={`p-3 rounded-lg border transition-all flex items-center justify-between ${
                      isActive
                        ? 'bg-blue-950/20 border-blue-500/50 shadow-sm'
                        : 'bg-slate-950/40 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedForExport.has(entry.id)}
                      onChange={() => toggleSelected(entry.id)}
                      className="rounded bg-slate-800 border-slate-700 text-blue-600 focus:ring-0 flex-shrink-0 mr-3"
                    />

                    <div className="space-y-1 min-w-0 flex-1 pr-3">
                      <div className="flex items-center space-x-2">
                        {isActive ? (
                          <CheckCircle2 className="w-4 h-4 text-blue-400 flex-shrink-0" />
                        ) : (
                          <span className="w-2 h-2 rounded-full bg-slate-700 inline-block flex-shrink-0" />
                        )}
                        <span className="font-bold text-xs text-slate-100 truncate">
                          {entry.namaOPD}
                        </span>
                        <span className="text-[10px] font-mono bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">
                          {entry.kodeOPD}
                        </span>
                      </div>

                      <div className="flex items-center space-x-3 text-[11px] text-slate-400 font-mono">
                        <span>{entry.nodeCount} node</span>
                        <span>·</span>
                        <span>Keb {entry.totalKebutuhan}</span>
                        <span>·</span>
                        <span className="text-slate-500">
                          Diubah {new Date(entry.updatedAt).toLocaleTimeString()}
                        </span>
                        {isUnexported && (
                          <span className="text-amber-400 font-sans font-medium flex items-center space-x-0.5">
                            <AlertTriangle className="w-3 h-3 inline" />
                            <span>belum diekspor</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center space-x-1.5 flex-shrink-0">
                      {!isActive && (
                        <button
                          onClick={() => handleSwitchProject(entry.id)}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-medium"
                        >
                          Buka
                        </button>
                      )}
                      <button
                        onClick={() => handleDuplicate(entry)}
                        className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded"
                        title="Duplikat Proyek"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => initiateDelete(entry)}
                        className="p-1.5 bg-slate-800 hover:bg-rose-900/40 text-slate-400 hover:text-rose-300 rounded"
                        title="Hapus Proyek"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Typed Delete Confirmation Dialog (for never-exported projects) */}
          {deleteConfirmTarget && (
            <div className="p-4 bg-rose-950/40 border-t border-rose-900/60 space-y-2 text-xs">
              <div className="flex items-center space-x-2 text-rose-300 font-semibold">
                <AlertTriangle className="w-4 h-4 text-rose-400" />
                <span>Konfirmasi Penghapusan Proyek Belum Diekspor</span>
              </div>
              <p className="text-slate-300">
                Proyek <strong className="text-white">{deleteConfirmTarget.namaOPD}</strong> belum pernah diekspor. Ketik nama OPD untuk menghapus secara permanen:
              </p>
              <input
                type="text"
                placeholder={deleteConfirmTarget.namaOPD}
                value={typedNameInput}
                onChange={e => setTypedNameInput(e.target.value)}
                className="w-full bg-slate-900 border border-rose-800/80 text-slate-100 rounded px-2.5 py-1.5 text-xs outline-none"
              />
              <div className="flex justify-end space-x-2 pt-1">
                <button
                  onClick={() => setDeleteConfirmTarget(null)}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs"
                >
                  Batal
                </button>
                <button
                  disabled={typedNameInput.trim() !== deleteConfirmTarget.namaOPD.trim()}
                  onClick={handleConfirmedTypedDelete}
                  className="px-3 py-1 bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white rounded text-xs font-medium"
                >
                  Hapus Permanen
                </button>
              </div>
            </div>
          )}

          {/* Footer Storage Meter */}
          <div className="px-4 py-2.5 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between text-xs text-slate-400 font-mono">
            <div className="flex items-center space-x-2">
              <HardDrive className="w-3.5 h-3.5 text-slate-500" />
              <span>
                Penyimpanan IndexedDB: {formatBytes(storageUsage.usedBytes)} dari ±
                {formatBytes(storageUsage.quotaBytes)} ({storageUsage.percentUsed.toFixed(1)}%)
              </span>
            </div>
          </div>
        </div>
      </div>

      {showImportDialog && (
        <ImportDialog
          onClose={() => {
            setShowImportDialog(false);
            loadData();
          }}
          onImported={() => {
            setShowImportDialog(false);
            onClose(); // proyek baru sudah aktif — langsung ke outline, bukan balik ke daftar
          }}
          onImportedBatch={() => {
            // Multi-berkas: tidak ada proyek yang otomatis aktif — tetap di
            // daftar (refresh) supaya user pilih sendiri OPD mana yang dibuka.
            setShowImportDialog(false);
            loadData();
          }}
        />
      )}

      {showBulkExport && (
        <BulkExportDialog
          selectedIds={[...selectedForExport]}
          onClose={() => {
            setShowBulkExport(false);
            setSelectedForExport(new Set());
            loadData(); // refresh status "belum diekspor" per proyek
          }}
        />
      )}
    </>
  );
};
