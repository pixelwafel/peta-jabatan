import React, { useState } from 'react';
import { FolderTree, Eye, AlertCircle, BarChart3 } from 'lucide-react';
import { RecapPanel } from '../recap/RecapPanel';
import { UnplacedPanel } from '../unplaced/UnplacedPanel';
import { TreeView } from '../tree/TreeView';
import { Canvas } from '../canvas/Canvas';

type StructureTab = 'outline' | 'preview' | 'unplaced' | 'recap';

export const StructurePanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<StructureTab>('outline');

  return (
    <div className="bg-slate-950 border-r border-slate-700 flex flex-col h-full select-none text-slate-300 min-w-0">
      {/* Tabs */}
      <div className="flex items-center border-b border-slate-800 px-2 py-1.5 space-x-1 text-sm">
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
      </div>

      {/* Tab Panel Content */}
      {activeTab === 'outline' && (
        <div className="flex-1 overflow-y-auto p-3 text-xs">
          <TreeView />
        </div>
      )}
      {activeTab === 'preview' && (
        <div className="flex-1 min-h-0">
          <Canvas />
        </div>
      )}
      {activeTab === 'unplaced' && (
        <div className="flex-1 overflow-y-auto p-3 text-xs">
          <UnplacedPanel />
        </div>
      )}
      {activeTab === 'recap' && (
        <div className="flex-1 overflow-y-auto p-3 text-xs">
          <RecapPanel />
        </div>
      )}
    </div>
  );
};
