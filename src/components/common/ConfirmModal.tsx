import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useUiStore } from '@/store/uiStore';

export const ConfirmModal: React.FC = () => {
  const dialog = useUiStore(s => s.dialog);
  const closeDialog = useUiStore(s => s.closeDialog);

  if (!dialog) return null;

  if (dialog.kind === 'delete-node') {
    const { nodeName, directChildCount, subtreeCount, orphanWarning } = dialog;

    const handleNodeOnly = () => {
      dialog.onDeleteNodeOnly();
      closeDialog();
    };
    const handleSubtree = () => {
      dialog.onDeleteSubtree();
      closeDialog();
    };

    return (
      <div
        className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 select-none"
        onClick={e => {
          if (e.target === e.currentTarget) closeDialog();
        }}
      >
        <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-w-md w-full overflow-hidden text-slate-200 animate-in fade-in zoom-in duration-150">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950/40">
            <div className="flex items-center space-x-2 font-semibold text-sm text-slate-100">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span>Hapus "{nodeName}"?</span>
            </div>
            <button
              onClick={closeDialog}
              className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-4 text-xs text-slate-300 leading-relaxed space-y-2">
            <p>
              Node ini punya {directChildCount} anak langsung ({subtreeCount} node total di
              bawahnya). Pilih salah satu:
            </p>
            {orphanWarning && (
              <p className="text-amber-400">
                ⚠ Node ini sendiri tidak berinduk. Kalau kamu pilih "node ini saja", semua anaknya
                akan menjadi node terpisah TANPA induk sama sekali (bukan naik ke atasan mana pun) —
                akan terlihat berdiri sendiri di kanvas.
              </p>
            )}
          </div>

          <div className="flex flex-col space-y-1.5 px-4 pb-3">
            <button
              onClick={handleNodeOnly}
              className="w-full text-left px-3 py-2 rounded text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
            >
              <span className="font-semibold">Hapus node ini saja</span>
              <span className="block text-[11px] text-slate-400 mt-0.5">
                {orphanWarning
                  ? `${directChildCount} anak langsung jadi node terpisah tanpa induk`
                  : `${directChildCount} anak langsung dipindah ke induk node ini`}
              </span>
            </button>
            <button
              onClick={handleSubtree}
              className="w-full text-left px-3 py-2 rounded text-xs font-medium bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40"
            >
              <span className="font-semibold">Hapus beserta seluruh isinya</span>
              <span className="block text-[11px] text-rose-400/80 mt-0.5">
                {subtreeCount} node di bawahnya ikut terhapus permanen
              </span>
            </button>
          </div>

          <div className="flex items-center justify-end px-4 py-3 border-t border-slate-800 bg-slate-950/40">
            <button
              onClick={closeDialog}
              className="px-3 py-1.5 rounded text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300"
            >
              Batal
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (dialog.kind !== 'confirm') return null;

  const handleConfirm = () => {
    dialog.onConfirm();
    closeDialog();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 select-none"
      onClick={e => {
        if (e.target === e.currentTarget) closeDialog();
      }}
    >
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
