import React from 'react';
import { Layers, Trash2, LayoutGrid } from 'lucide-react';
import { useProjectStore } from '@/store/projectStore';
import { useUiStore } from '@/store/uiStore';
import { getKategoriList } from '@/config/resolver';

export const MultiSelectionPanel: React.FC = () => {
  const selectedNodeIds = useUiStore(s => s.selectedNodeIds);
  const clearSelection = useUiStore(s => s.clearSelection);
  const openConfirm = useUiStore(s => s.openConfirm);

  const project = useProjectStore(s => s.project);
  const deleteNode = useProjectStore(s => s.deleteNode);
  const setKategori = useProjectStore(s => s.setKategori);

  const nodes = project?.nodes ?? [];
  const selectedNodes = nodes.filter(n => selectedNodeIds.includes(n.id));

  const jabatanNodes = selectedNodes.filter(n => n.type === 'jabatan');
  const unitCount = selectedNodes.length - jabatanNodes.length;

  const handleDeleteSelected = () => {
    openConfirm({
      title: `Hapus ${selectedNodes.length} node terpilih?`,
      body: `Penghapusan akan menghapus ${selectedNodes.length} node dari struktur beserta hubungan atasannya.`,
      confirmLabel: 'Hapus Semua',
      danger: true,
      onConfirm: () => {
        for (const id of selectedNodeIds) {
          deleteNode(id, 'node-only');
        }
        clearSelection();
      },
    });
  };

  const handleBulkKategori = (katId: string) => {
    for (const node of jabatanNodes) {
      setKategori(node.id, katId);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <div className="flex items-center space-x-2 text-slate-200 font-semibold text-xs">
          <Layers className="w-4 h-4 text-blue-400" />
          <span>Banyak Node Terpilih ({selectedNodes.length})</span>
        </div>
        <button
          onClick={clearSelection}
          className="text-[11px] text-slate-400 hover:text-slate-200"
        >
          Batal Pilih
        </button>
      </div>

      <div className="space-y-3 text-xs">
        {/* Bulk Category Set for Jabatan Nodes */}
        {jabatanNodes.length > 0 && (
          <div className="space-y-1 bg-slate-950/40 p-2.5 rounded-lg border border-slate-800">
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
              Set Kategori ({jabatanNodes.length} Jabatan)
            </label>
            {unitCount > 0 && (
              <span className="text-[10px] text-slate-500 italic block mb-1">
                ({unitCount} unit dilewati)
              </span>
            )}
            <select
              defaultValue=""
              onChange={e => {
                if (e.target.value) handleBulkKategori(e.target.value);
              }}
              className="w-full bg-slate-800 border border-slate-700 text-slate-100 rounded px-2.5 py-1.5 text-xs outline-none focus:border-blue-500"
            >
              <option value="">— Pilih Kategori Massal —</option>
              {getKategoriList().map(k => (
                <option key={k.id} value={k.id}>
                  {k.nama}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-2 pt-2">
          <button
            onClick={handleDeleteSelected}
            className="w-full flex items-center justify-center space-x-1.5 px-3 py-2 bg-rose-600/20 border border-rose-500/40 hover:bg-rose-600/30 text-rose-300 font-medium rounded text-xs transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Hapus {selectedNodes.length} Node Terpilih</span>
          </button>
        </div>
      </div>
    </div>
  );
};
