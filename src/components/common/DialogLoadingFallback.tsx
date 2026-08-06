import React from 'react';
import { Loader2 } from 'lucide-react';

/**
 * Fase 1.8 — fallback Suspense untuk dialog yang di-lazy-load (React.lazy).
 * Overlay modal minimal, konsisten dengan gaya backdrop dialog lain, supaya
 * jeda pemuatan chunk (biasanya <100ms, sekali per sesi berkat cache
 * browser) tidak terasa seperti UI yang "kosong"/patah.
 */
export const DialogLoadingFallback: React.FC = () => (
  <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center select-none">
    <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
  </div>
);
