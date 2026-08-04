import React, { useEffect } from 'react';
import { CheckCircle, AlertTriangle } from 'lucide-react';
import { useUiStore } from '@/store/uiStore';

const AUTO_DISMISS_MS = 3500;

export const Toast: React.FC = () => {
  const toast = useUiStore(s => s.toast);
  const clearToast = useUiStore(s => s.clearToast);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(clearToast, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [toast, clearToast]);

  if (!toast) return null;

  const isError = toast.tone === 'error';

  return (
    <div className="fixed bottom-4 right-4 z-[100] select-none">
      <div
        className={`flex items-center space-x-2 px-4 py-2.5 rounded-lg shadow-lg border text-sm font-medium ${
          isError
            ? 'bg-rose-950/90 border-rose-800 text-rose-200'
            : 'bg-emerald-950/90 border-emerald-800 text-emerald-200'
        }`}
      >
        {isError ? (
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
        ) : (
          <CheckCircle className="w-4 h-4 flex-shrink-0" />
        )}
        <span>{toast.message}</span>
      </div>
    </div>
  );
};
