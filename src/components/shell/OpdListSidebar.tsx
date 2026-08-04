import React, { useEffect, useMemo, useState } from 'react';
import { ProjectIndex } from '@/persistence/types';
import { getProjectIndex, getProject } from '@/persistence/storage';
import { useProjectStore } from '@/store/projectStore';
import { Folder, Search, Settings } from 'lucide-react';
import { ProjectManagerDialog } from '../dialogs/ProjectManagerDialog';

/**
 * Kolom 1: daftar OPD. Versi inline dari ProjectManagerDialog.tsx (buka/pindah
 * proyek) — tidak ada logic backend baru. Aksi lanjutan (buat/duplikat/hapus/
 * impor) tetap lewat dialog "Kelola...".
 */
export const OpdListSidebar: React.FC = () => {
  const [index, setIndex] = useState<ProjectIndex | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showManager, setShowManager] = useState(false);

  const currentProject = useProjectStore(s => s.project);
  const setProject = useProjectStore(s => s.setProject);

  const loadIndex = () => {
    getProjectIndex().then(setIndex);
  };

  useEffect(() => {
    loadIndex();
  }, [currentProject?.id, currentProject?.updatedAt]);

  const filteredEntries = useMemo(() => {
    if (!index) return [];
    if (!searchTerm.trim()) return index.entries;
    const term = searchTerm.toLowerCase();
    return index.entries.filter(
      e => e.namaOPD.toLowerCase().includes(term) || e.kodeOPD.toLowerCase().includes(term)
    );
  }, [index, searchTerm]);

  const handleSelect = async (id: string) => {
    if (id === currentProject?.id) return;
    const p = await getProject(id);
    if (p) setProject(p);
  };

  return (
    <aside className="w-[260px] bg-slate-900 border-r border-slate-700 flex flex-col h-full select-none text-slate-300">
      <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
        <div className="flex items-center space-x-2 font-medium text-sm text-slate-200">
          <Folder className="w-4 h-4 text-blue-400" />
          <span>Daftar OPD</span>
        </div>
      </div>

      <div className="p-2 border-b border-slate-800/80">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2 top-1.5 text-slate-500" />
          <input
            type="text"
            placeholder="Cari OPD..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 text-slate-100 rounded pl-7 pr-2 py-1 text-xs outline-none focus:border-blue-500"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
        {filteredEntries.length === 0 ? (
          <div className="py-6 text-center text-slate-500 text-[11px] italic">
            Tidak ada proyek ditemukan.
          </div>
        ) : (
          filteredEntries.map(entry => {
            const isActive = currentProject?.id === entry.id;
            return (
              <button
                key={entry.id}
                onClick={() => handleSelect(entry.id)}
                className={`w-full text-left px-2 py-2 rounded text-sm transition-colors ${
                  isActive
                    ? 'bg-blue-900/40 text-blue-200 font-semibold'
                    : 'hover:bg-slate-800/60 text-slate-300'
                }`}
              >
                <div className="truncate font-medium">{entry.namaOPD}</div>
                <div className="text-[11px] text-slate-500 font-mono">{entry.kodeOPD}</div>
              </button>
            );
          })
        )}
      </div>

      <div className="p-2 border-t border-slate-800">
        <button
          onClick={() => setShowManager(true)}
          className="w-full flex items-center justify-center space-x-1.5 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded border border-slate-700"
        >
          <Settings className="w-3.5 h-3.5 text-blue-400" />
          <span>Kelola...</span>
        </button>
      </div>

      {showManager && (
        <ProjectManagerDialog
          onClose={() => {
            setShowManager(false);
            loadIndex();
          }}
        />
      )}
    </aside>
  );
};
