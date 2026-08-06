import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { getProject, saveProject } from '@/persistence/storage';
import { flushSave } from '@/persistence/autosave';
import { buildBlankProject } from '@/persistence/blankProject';
import { requestDeleteProject } from '@/persistence/deleteProjectFlow';
import { useProjectStore } from '@/store/projectStore';
import { useProjectIndexStore } from '@/store/projectIndexStore';
import { useUiStore } from '@/store/uiStore';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { computeVisibleRange } from '@/utils/virtualization';
import { Folder, Search, Settings, Plus, Upload, Trash2, LayoutDashboard } from 'lucide-react';
import { DialogLoadingFallback } from '../common/DialogLoadingFallback';
import { ResizeHandle } from './ResizeHandle';

// Fase 2.5 — sama seperti InstanceGrid.tsx/TreeView.tsx: tinggi baris tetap
// (nama + kode OPD dua baris + padding) dipakai virtualisasi. Ratusan OPD
// (target skala app ini) berarti ratusan baris DOM kalau tidak di-window.
const ROW_HEIGHT = 52;
const OVERSCAN = 8;
const FALLBACK_VIEWPORT_HEIGHT = 480;

// Fase 1.8 — dialog "berat" (ImportDialog 800+ baris, ProjectManagerDialog,
// RecapDashboard) di-lazy-load: keluar dari entry chunk, dimuat sebagai
// chunk terpisah hanya saat operator benar-benar membukanya. Named export
// (bukan default), jadi dibungkus .then() untuk bentuk yang React.lazy minta.
const ProjectManagerDialog = lazy(() =>
  import('../dialogs/ProjectManagerDialog').then(m => ({ default: m.ProjectManagerDialog }))
);
const ImportDialog = lazy(() =>
  import('../dialogs/ImportDialog').then(m => ({ default: m.ImportDialog }))
);
const RecapDashboard = lazy(() =>
  import('../dashboard/RecapDashboard').then(m => ({ default: m.RecapDashboard }))
);

interface OpdListSidebarProps {
  width: number;
  onResizeDrag: (clientX: number) => void;
}

/**
 * Kolom 1: daftar OPD. Versi inline dari ProjectManagerDialog.tsx (buka/pindah
 * proyek) — tidak ada logic backend baru. "+ Tambah OPD" dan "Impor" adalah
 * akses langsung ke dua aksi yang paling sering dipakai, supaya tidak harus
 * lewat dialog "Kelola..." dulu setiap kali. Aksi lanjutan (duplikat/hapus/
 * ekspor massal/cari) tetap lewat "Kelola...".
 */
export const OpdListSidebar: React.FC<OpdListSidebarProps> = ({ width, onResizeDrag }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showManager, setShowManager] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);

  const currentProject = useProjectStore(s => s.project);
  const setProject = useProjectStore(s => s.setProject);
  const openConfirm = useUiStore(s => s.openConfirm);

  // Fase 1.5: dulu OpdListSidebar baca IndexedDB sendiri lewat efek ber-dep
  // `currentProject?.updatedAt` — updatedAt berubah tiap commit, jadi ini
  // membaca ULANG SELURUH index dari IndexedDB tiap keystroke. Index yang
  // sama sudah dipelihara di useProjectIndexStore (diisi bootstrap.ts saat
  // start, disegarkan autosave.ts:40 tiap kali project TERSIMPAN — bukan
  // tiap kali diedit), jadi baca dari situ langsung: nol IndexedDB read
  // tambahan di jalur render.
  const index = useProjectIndexStore(s => s.index);

  // Aksi yang mengubah daftar TANPA lewat autosave (buat baru/duplikat/hapus/
  // impor) — refresh lewat SATU sumber yang sama supaya consumer lain
  // (LinkEditor, LinkCard, recap.ts) juga ikut segar, bukan cuma sidebar ini.
  const loadIndex = () => {
    void useProjectIndexStore.getState().refresh();
  };

  // Fase 1.7: input pencarian tetap langsung (state lokal), filter di
  // belakangnya di-debounce — daftar OPD bisa ratusan entri, tidak perlu
  // difilter ulang tiap karakter saat mengetik cepat.
  const debouncedSearchTerm = useDebouncedValue(searchTerm);

  const filteredEntries = useMemo(() => {
    if (!index) return [];
    if (!debouncedSearchTerm.trim()) return index.entries;
    const term = debouncedSearchTerm.toLowerCase();
    return index.entries.filter(
      e => e.namaOPD.toLowerCase().includes(term) || e.kodeOPD.toLowerCase().includes(term)
    );
  }, [index, debouncedSearchTerm]);

  // Fase 2.5 — windowing manual, pola sama seperti InstanceGrid.tsx.
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(FALLBACK_VIEWPORT_HEIGHT);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const height = entries[0]?.contentRect.height;
      if (height) setViewportHeight(height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { startIndex, endIndex } = computeVisibleRange(
    scrollTop,
    ROW_HEIGHT,
    viewportHeight,
    OVERSCAN,
    filteredEntries.length
  );
  const visibleEntries = filteredEntries.slice(startIndex, endIndex);

  const handleSelect = async (id: string) => {
    if (id === currentProject?.id) return;
    // Fase 1.1: simpan dulu perubahan project yang sedang terbuka sebelum
    // pindah — kalau tidak, save 500ms yang tertunda dibuang begitu saja saat
    // scheduleSave() menimpa pendingProject dengan project baru.
    await flushSave();
    const p = await getProject(id);
    if (p) setProject(p);
  };

  const handleAddOpd = async () => {
    await flushSave();
    const newProject = buildBlankProject();
    await saveProject(newProject);
    setProject(newProject);
    // saveProject() di sini bukan lewat autosave (yang otomatis me-refresh
    // useProjectIndexStore) — refresh manual supaya OPD baru langsung
    // muncul di daftar.
    loadIndex();
  };

  const handleDelete = (e: React.MouseEvent, entryId: string) => {
    e.stopPropagation();
    const entry = index?.entries.find(x => x.id === entryId);
    if (!entry) return;

    requestDeleteProject(entry, openConfirm, async () => {
      if (currentProject?.id === entry.id) {
        setProject(null);
      }
      loadIndex();
    });
  };

  return (
    <aside
      className="relative min-h-0 bg-slate-900 border-r border-slate-700 flex flex-col h-full select-none text-slate-300"
      style={{ width: `${width}px` }}
    >
      <ResizeHandle side="right" onDrag={onResizeDrag} />
      <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2 flex-shrink-0">
        <div className="flex items-center space-x-2 font-medium text-sm text-slate-200">
          <Folder className="w-4 h-4 text-blue-400" />
          <span>Daftar OPD</span>
        </div>
      </div>

      <div className="p-2 border-b border-slate-800/80 flex-shrink-0">
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

      <div
        ref={scrollRef}
        onScroll={e => setScrollTop(e.currentTarget.scrollTop)}
        className="flex-1 min-h-0 overflow-y-auto p-1.5"
      >
        {filteredEntries.length === 0 ? (
          <div className="py-6 text-center text-slate-500 text-[11px] italic">
            Tidak ada proyek ditemukan.
          </div>
        ) : (
          <div style={{ height: filteredEntries.length * ROW_HEIGHT, position: 'relative' }}>
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                transform: `translateY(${startIndex * ROW_HEIGHT}px)`,
              }}
            >
              {visibleEntries.map(entry => {
                const isActive = currentProject?.id === entry.id;
                return (
                  <div
                    key={entry.id}
                    style={{ height: ROW_HEIGHT }}
                    className={`group w-full flex items-center rounded transition-colors ${
                      isActive ? 'bg-blue-900/40' : 'hover:bg-slate-800/60'
                    }`}
                  >
                    <button
                      onClick={() => handleSelect(entry.id)}
                      className={`flex-1 min-w-0 text-left px-2 py-2 rounded text-sm ${
                        isActive ? 'text-blue-200 font-semibold' : 'text-slate-300'
                      }`}
                    >
                      <div className="truncate font-medium">{entry.namaOPD}</div>
                      <div className="text-[11px] text-slate-500 font-mono">{entry.kodeOPD}</div>
                    </button>
                    <button
                      onClick={e => handleDelete(e, entry.id)}
                      title="Hapus Proyek"
                      className="flex-shrink-0 p-1.5 mr-1 rounded text-slate-500 opacity-0 group-hover:opacity-100 hover:bg-rose-900/40 hover:text-rose-300 transition-opacity"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="p-2 border-t border-slate-800 space-y-1.5">
        <button
          onClick={() => setShowDashboard(true)}
          className="w-full flex items-center justify-center space-x-1.5 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded border border-slate-700"
          title="Dashboard rekap seluruh OPD (docs/14-recap-dashboard.md)"
        >
          <LayoutDashboard className="w-3.5 h-3.5 text-blue-400" />
          <span>Dashboard</span>
        </button>
        <button
          onClick={handleAddOpd}
          className="w-full flex items-center justify-center space-x-1.5 px-2.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded shadow-sm"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Tambah OPD</span>
        </button>
        <button
          onClick={() => setShowImportDialog(true)}
          className="w-full flex items-center justify-center space-x-1.5 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded border border-slate-700"
        >
          <Upload className="w-3.5 h-3.5 text-blue-400" />
          <span>Impor</span>
        </button>
        <button
          onClick={() => setShowManager(true)}
          className="w-full flex items-center justify-center space-x-1.5 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded border border-slate-700"
        >
          <Settings className="w-3.5 h-3.5 text-blue-400" />
          <span>Kelola...</span>
        </button>
      </div>

      <Suspense fallback={<DialogLoadingFallback />}>
        {showDashboard && <RecapDashboard onClose={() => setShowDashboard(false)} />}

        {showManager && (
          <ProjectManagerDialog
            onClose={() => {
              setShowManager(false);
              loadIndex();
            }}
          />
        )}

        {showImportDialog && (
          <ImportDialog
            onClose={() => {
              setShowImportDialog(false);
              loadIndex();
            }}
            onImported={() => {
              // 1 berkas -> sudah jadi proyek aktif (ImportDialog memanggil
              // setProject sendiri), cuma perlu tutup dialognya.
              setShowImportDialog(false);
            }}
            onImportedBatch={() => {
              // Multi-berkas -> tidak ada yang otomatis aktif, refresh daftar
              // supaya OPD baru langsung kelihatan & bisa dipilih dari sini.
              setShowImportDialog(false);
              loadIndex();
            }}
          />
        )}
      </Suspense>
    </aside>
  );
};
