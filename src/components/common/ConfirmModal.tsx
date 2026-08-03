import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useUiStore } from '@/store/uiStore';

export const ConfirmModal: React.FC = () => {
  const dialog = useUiStore(s => s.dialog);
  const closeDialog = useUiStore(s => s.closeDialog);

  if (!dialog || dialog.kind !== 'confirm') return null;

  const handleConfirm = () => {
    dialog.onConfirm();
    closeDialog();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-w-md w-full overflow-hidden text-slate-200 animate-in fade-in zoom-in duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950/40">
          <div className="flex items-center space-x-2 font-semibold text-sm text-slate-100">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <span>{dialog.title}</span>
          </div>
          <button
            onClick={closeDialog}
            className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 text-xs text-slate-300 leading-relaxed">
          {dialog.body}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end space-x-2 px-4 py-3 border-t border-slate-800 bg-slate-950/40">
          <button
            onClick={closeDialog}
            className="px-3 py-1.5 rounded text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300"
          >
            Batal
          </button>
          <button
            onClick={handleConfirm}
            className={`px-3 py-1.5 rounded text-xs font-medium text-white shadow-sm ${
              dialog.danger
                ? 'bg-rose-600 hover:bg-rose-500'
                : 'bg-blue-600 hover:bg-blue-500'
            }`}
          >
            {dialog.confirmLabel ?? 'Lanjutkan'}
          </button>
        </div>
      </div>
    </div>
  );
};
