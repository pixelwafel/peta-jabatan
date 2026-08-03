import React from 'react';
import { AlertOctagon, Download, Folder } from 'lucide-react';
import { useUiStore } from '@/store/uiStore';

interface RecoveryDialogProps {
  projectId: string;
  rawPayload: string | null;
  onOpenProjectManager: () => void;
}

export const RecoveryDialog: React.FC<RecoveryDialogProps> = ({
  projectId,
  rawPayload,
  onOpenProjectManager,
}) => {
  const closeDialog = useUiStore(s => s.closeDialog);

  const handleDownloadRaw = () => {
    const blob = new Blob([rawPayload ?? '{}'], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rusak_${projectId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="bg-slate-900 border border-rose-900/80 rounded-xl shadow-2xl max-w-md w-full p-4 space-y-4 text-slate-200">
        <div className="flex items-center space-x-2.5 font-bold text-sm text-rose-400 border-b border-slate-800 pb-2">
          <AlertOctagon className="w-5 h-5 text-rose-500" />
          <span>Project Tidak Dapat Dibuka</span>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed">
          Data project <code className="text-amber-400 font-mono">{projectId}</code> rusak atau dibuat oleh versi aplikasi lain. Unduh salinan mentahnya untuk diperiksa sebelum ditimpa.
        </p>

        <div className="flex flex-col space-y-2 pt-2">
          <button
            onClick={handleDownloadRaw}
            className="w-full flex items-center justify-center space-x-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-medium border border-slate-700"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Unduh Data Mentah (JSON)</span>
          </button>

          <button
            onClick={() => {
              closeDialog();
              onOpenProjectManager();
            }}
            className="w-full flex items-center justify-center space-x-2 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-medium"
          >
            <Folder className="w-3.5 h-3.5" />
            <span>Buka Proyek Lain</span>
          </button>
        </div>
      </div>
    </div>
  );
};
