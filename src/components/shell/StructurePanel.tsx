import React from 'react';
import { FolderTree, Eye, AlertCircle, BarChart3, LayoutGrid } from 'lucide-react';
import { RecapPanel } from '../recap/RecapPanel';
import { UnplacedPanel } from '../unplaced/UnplacedPanel';
import { TreeView } from '../tree/TreeView';
import { Canvas } from '../canvas/Canvas';
import { InstanceGrid } from '../instance/InstanceGrid';
import { useProjectStore } from '@/store/projectStore';
import { useUiStore } from '@/store/uiStore';
import { useShallow } from 'zustand/react/shallow';

export const StructurePanel: React.FC = () => {
  const activeTab = useUiStore(s => s.structureTab);
  const setActiveTab = useUiStore(s => s.setStructureTab);
  const selectedTemplateId = useUiStore(s => s.selectedTemplateId);
  const setSelectedTemplateId = useUiStore(s => s.setSelectedTemplateId);

  // Fase 1.5: dulu StructurePanel subscribe ke SELURUH `project` cuma untuk
  // menurunkan daftar unit template ini — re-render (dan filter O(N)) tiap
  // keystroke walau template unit nyaris tidak pernah berubah. useShallow
  // membandingkan ISI array hasil filter (bukan identitas project); berkat
  // structural sharing Immer, node yang tidak disentuh tetap referensi yang
  // sama antar-commit, jadi array ini stabil (dan re-render di-skip) kecuali
  // keanggotaan/isi node template-nya sendiri yang berubah.
  const templateUnits = useProjectStore(
    useShallow(s => (s.project?.nodes ?? []).filter(n => n.isTemplate))
  );

  const effectiveTemplateId =
    (selectedTemplateId && templateUnits.some(n => n.id === selectedTemplateId) ? selectedTemplateId : null) ??
    templateUnits[0]?.id ??
    null;

  return (
    <div className="bg-slate-950 border-r border-slate-700 flex flex-col h-full min-h-0 select-none text-slate-300 min-w-0">
      {/* Tabs */}
      <div className="flex items-center border-b border-slate-800 px-2 py-1.5 space-x-1 text-sm flex-shrink-0">
        <button
          onClick={() => setActiveTab('outline')}
          className={`flex items-center space-x-1.5 px-2.5 py-1 rounded font-medium ${
            activeTab === 'outline' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 text-slate-400'
          }`}
        >
          <FolderTree className="w-3.5 h-3.5" />
          <span>Outline</span>
        </button>
        <button
          onClick={() => setActiveTab('preview')}
          className={`flex items-center space-x-1.5 px-2.5 py-1 rounded font-medium ${
            activeTab === 'preview' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 text-slate-400'
          }`}
        >
          <Eye className="w-3.5 h-3.5" />
          <span>Preview</span>
        </button>
        <button
          onClick={() => setActiveTab('unplaced')}
          className={`flex items-center space-x-1.5 px-2.5 py-1 rounded font-medium ${
            activeTab === 'unplaced' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 text-slate-400'
          }`}
        >
          <AlertCircle className="w-3.5 h-3.5" />
          <span>Unplaced</span>
        </button>
        <button
          onClick={() => setActiveTab('recap')}
          className={`flex items-center space-x-1.5 px-2.5 py-1 rounded font-medium ${
            activeTab === 'recap' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 text-slate-400'
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" />
          <span>Rekap</span>
        </button>
        {templateUnits.length > 0 && (
          <button
            onClick={() => setActiveTab('satuan')}
            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded font-medium ${
              activeTab === 'satuan' ? 'bg-teal-600 text-white' : 'hover:bg-slate-800 text-teal-400'
            }`}
            title="Grid instance template (docs/15-template-instance.md §2)"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>Satuan</span>
          </button>
        )}
      </div>

      {/* Tab Panel Content */}
      {activeTab === 'outline' && (
        // Fase 2.5 — TreeView sekarang punya scroll container (+ padding)
        // sendiri untuk virtualisasi (butuh scrollTop & tinggi viewport
        // sungguhan) — wrapper di sini tinggal beri ruang lewat flex,
        // TIDAK overflow-y-auto lagi (dua scroll container bersarang akan
        // membuat scrollbar dobel / matematika windowing salah).
        <div className="flex-1 min-h-0 flex flex-col">
          <TreeView />
        </div>
      )}
      {activeTab === 'preview' && (
        <div className="flex-1 min-h-0">
          <Canvas />
        </div>
      )}
      {activeTab === 'unplaced' && (
        <div className="flex-1 min-h-0 overflow-y-auto p-3 text-xs">
          <UnplacedPanel />
        </div>
      )}
      {activeTab === 'recap' && (
        <div className="flex-1 min-h-0 overflow-y-auto p-3 text-xs">
          <RecapPanel />
        </div>
      )}
      {activeTab === 'satuan' && (
        <div className="flex-1 min-h-0 flex flex-col">
          {templateUnits.length > 1 && (
            <div className="flex items-center space-x-2 px-3 py-1.5 border-b border-slate-800 bg-slate-950/30 flex-shrink-0">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">Template</span>
              <select
                value={effectiveTemplateId ?? ''}
                onChange={e => setSelectedTemplateId(e.target.value)}
                className="bg-slate-800 border border-slate-700 text-slate-100 rounded px-2 py-1 text-xs outline-none focus:border-blue-500"
              >
                {templateUnits.map(n => (
                  <option key={n.id} value={n.id}>
                    {n.nama}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex-1 min-h-0">
            {effectiveTemplateId && <InstanceGrid templateNodeId={effectiveTemplateId} />}
          </div>
        </div>
      )}
    </div>
  );
};
