import React, { useState } from 'react';
import { Folder, Plus, LayoutGrid, Undo, Redo, ShieldCheck, Download } from 'lucide-react';
import { useProjectStore } from '@/store/projectStore';
import { useHistoryStore } from '@/store/historyStore';
import { useUiStore } from '@/store/uiStore';
import { validateProject } from '@/selectors/validation';
import { ProjectManagerDialog } from '../dialogs/ProjectManagerDialog';
import { ExportDialog } from '../dialogs/ExportDialog';
import { ReadinessDialog } from '../dialogs/ReadinessDialog';
import { computeLayout } from '@/utils/layout';

export const Toolbar: React.FC = () => {
  const [showProjectManager, setShowProjectManager] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showReadinessDialog, setShowReadinessDialog] = useState(false);

  const project = useProjectStore(s => s.project);
  const addNode = useProjectStore(s => s.addNode);
  const undo = useProjectStore(s => s.undo);
  const redo = useProjectStore(s => s.redo);
  const selectedNodeIds = useUiStore(s => s.selectedNodeIds);
  const showJenjangOnCard = useUiStore(s => s.showJenjangOnCard);
  const openConfirm = useUiStore(s => s.openConfirm);

  const past = useHistoryStore(s => s.past);
  const future = useHistoryStore(s => s.future);

  const findings = project ? validateProject(project) : [];
  const issueCount = findings.filter(f => f.severity === 'error' || f.severity === 'warning').length;

  const undoLabel = past.length > 0 ? `Batalkan: ${past.at(-1)?.label}` : 'Undo';
  const redoLabel = future.length > 0 ? `Ulangi: ${future[0]?.label}` : 'Redo';

  const handleAddPosition = () => {
    const parentId = selectedNodeIds[0];
    addNode({ type: 'jabatan', parentId });
  };

  const handleTidy = () => {
    if (!project) return;

    openConfirm({
      title: 'Rapikan Layout Struktur?',
      body: 'Rapikan akan menata ulang posisi seluruh node pada kanvas menggunakan algoritma Dagre. Tindakan ini dapat dibatalkan dengan Ctrl+Z.',
      confirmLabel: 'Rapikan',
      onConfirm: () => {
        const layout = computeLayout(project.nodes, project.edges, {
          direction: 'TB',
          scope: 'all',
          showJenjang: showJenjangOnCard,
        });
        useProjectStore.getState().applyLayout(layout);
      },
    });
  };

  return (
    <>
      <header className="h-[48px] bg-slate-800 text-white flex items-center justify-between px-3 select-none z-10 border-b border-slate-700">
        <div className="flex items-center space-x-2">
          {/* Brand & Project Group */}
          <div className="flex items-center space-x-1.5 font-bold text-slate-100 pr-3 border-r border-slate-700 text-sm">
            <span className="bg-blue-600 text-white text-xs px-2 py-0.5 rounded font-mono">OPD</span>
            <span>Peta Jabatan Builder</span>
          </div>

          {/* Action groups */}
          <div className="flex items-center space-x-1 text-xs">
            <button
              onClick={() => setShowProjectManager(true)}
              className="flex items-center space-x-1 px-2.5 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-slate-200"
              title="Kelola Proyek"
            >
              <Folder className="w-3.5 h-3.5 text-blue-400" />
              <span>Proyek</span>
            </button>

            <button
              onClick={handleAddPosition}
              className="flex items-center space-x-1 px-2.5 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-slate-200"
              title="Tambah Jabatan"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah</span>
            </button>

            <button
              onClick={handleTidy}
              className="flex items-center space-x-1 px-2.5 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-slate-200"
              title="Rapikan Layout (Dagre Auto-Layout)"
            >
              <LayoutGrid className="w-3.5 h-3.5 text-slate-300" />
              <span>Rapikan</span>
            </button>

            <div className="h-4 w-px bg-slate-700 mx-1" />

            {/* History Group with Operation Name Tooltips (doc 11 §2) */}
            <button
              onClick={undo}
              disabled={past.length === 0}
              className="p-1.5 bg-slate-700 text-slate-300 hover:text-slate-100 hover:bg-slate-600 rounded disabled:opacity-40"
              title={undoLabel}
            >
              <Undo className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={redo}
              disabled={future.length === 0}
              className="p-1.5 bg-slate-700 text-slate-300 hover:text-slate-100 hover:bg-slate-600 rounded disabled:opacity-40"
              title={redoLabel}
            >
              <Redo className="w-3.5 h-3.5" />
            </button>

            <div className="h-4 w-px bg-slate-700 mx-1" />

            {/* Readiness check */}
            <button
              onClick={() => setShowReadinessDialog(true)}
              className="flex items-center space-x-1 px-2.5 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-slate-200 relative"
              title="Cek Kesiapan Data"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Cek Kesiapan</span>
              {issueCount > 0 && (
                <span className="ml-1 bg-amber-500 text-slate-950 font-bold font-mono text-[10px] px-1.5 py-0.2 rounded-full">
                  {issueCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Export Group */}
        <div className="flex items-center space-x-2 text-xs">
          <button
            onClick={() => setShowExportDialog(true)}
            className="flex items-center space-x-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded shadow-sm"
            title="Ekspor Data (XLSX, JSON, CSV, PNG)"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Ekspor</span>
          </button>
        </div>
      </header>

      {showProjectManager && (
        <ProjectManagerDialog onClose={() => setShowProjectManager(false)} />
      )}

      {showExportDialog && (
        <ExportDialog onClose={() => setShowExportDialog(false)} />
      )}

      {showReadinessDialog && (
        <ReadinessDialog
          onClose={() => setShowReadinessDialog(false)}
          onOpenExport={() => setShowExportDialog(true)}
        />
      )}
    </>
  );
};
