import React from 'react';

export const CanvasPlaceholder: React.FC = () => {
  return (
    <main className="flex-1 bg-slate-950 flex flex-col items-center justify-center p-6 text-center text-slate-500 relative select-none overflow-hidden">
      {/* Grid Pattern Background */}
      <div
        className="absolute inset-0 opacity-10 pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(circle, #94a3b8 1px, transparent 1px)`,
          backgroundSize: '24px 24px',
        }}
      />

      <div className="relative z-10 space-y-3 max-w-md">
        <div className="w-16 h-16 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-center mx-auto text-slate-400 font-bold text-xl shadow-lg">
          PJB
        </div>
        <h2 className="text-lg font-semibold text-slate-300">Peta Jabatan Builder Canvas</h2>
        <p className="text-xs text-slate-400 leading-relaxed">
          Modul kanvas interaktif (React Flow + Dagre layout) akan diintegrasikan pada Milestone M2.
          Saat ini sistem berjalan dalam mode headless (M1 state &amp; history, selector layer).
        </p>
      </div>
    </main>
  );
};
