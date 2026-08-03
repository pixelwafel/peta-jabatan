import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, FolderTree, AlertCircle, BarChart3 } from 'lucide-react';
import { RecapPanel } from '../recap/RecapPanel';
import { UnplacedPanel } from '../unplaced/UnplacedPanel';
import { TreeView } from '../tree/TreeView';

interface LeftSidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export const LeftSidebar: React.FC<LeftSidebarProps> = ({ collapsed, onToggleCollapse }) => {
  const [activeTab, setActiveTab] = useState<'tree' | 'unplaced' | 'recap'>('tree');

  if (collapsed) {
    return (
      <aside className="w-[36px] bg-slate-900 border-r border-slate-700 flex flex-col items-center py-2 space-y-4 text-slate-400 select-none">
        <button
          onClick={onToggleCollapse}
          className="p-1 hover:text-slate-100 hover:bg-slate-800 rounded"
          title="Buka Panel Kiri"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <button
          onClick={() => { setActiveTab('tree'); onToggleCollapse(); }}
          className={`p-1 rounded ${activeTab === 'tree' ? 'text-blue-400 bg-slate-800' : 'hover:text-slate-200'}`}
          title="Struktur (Tree)"
        >
          <FolderTree className="w-4 h-4" />
        </button>
        <button
          onClick={() => { setActiveTab('unplaced'); onToggleCollapse(); }}
          className={`p-1 rounded ${activeTab === 'unplaced' ? 'text-blue-400 bg-slate-800' : 'hover:text-slate-200'}`}
          title="Belum Ditempatkan"
        >
          <AlertCircle className="w-4 h-4" />
        </button>
        <button
          onClick={() => { setActiveTab('recap'); onToggleCollapse(); }}
          className={`p-1 rounded ${activeTab === 'recap' ? 'text-blue-400 bg-slate-800' : 'hover:text-slate-200'}`}
          title="Rekapitulasi"
        >
          <BarChart3 className="w-4 h-4" />
        </button>
      </aside>
    );
  }

  return (
    <aside className="w-[280px] bg-slate-900 border-r border-slate-700 flex flex-col h-full select-none text-slate-300">
      {/* Sidebar Header & Tabs */}
      <div className="flex items-center justify-between border-b border-slate-800 px-2 py-1.5">
        <div className="flex space-x-1 text-xs">
          <button
            onClick={() => setActiveTab('tree')}
            className={`px-2.5 py-1 rounded font-medium ${
              activeTab === 'tree' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 text-slate-400'
            }`}
          >
            Struktur
          </button>
          <button
            onClick={() => setActiveTab('unplaced')}
            className={`px-2.5 py-1 rounded font-medium ${
              activeTab === 'unplaced' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 text-slate-400'
            }`}
          >
            Unplaced
          </button>
          <button
            onClick={() => setActiveTab('recap')}
            className={`px-2.5 py-1 rounded font-medium ${
              activeTab === 'recap' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 text-slate-400'
            }`}
          >
            Rekap
          </button>
        </div>
        <button
          onClick={onToggleCollapse}
          className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-200"
          title="Tutup Panel Kiri"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      {/* Tab Panel Content */}
      <div className="flex-1 overflow-y-auto p-3 text-xs">
        {activeTab === 'tree' && <TreeView />}
        {activeTab === 'unplaced' && <UnplacedPanel />}
        {activeTab === 'recap' && <RecapPanel />}
      </div>
    </aside>
  );
};
