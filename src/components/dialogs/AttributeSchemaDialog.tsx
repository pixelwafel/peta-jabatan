import React, { useState } from 'react';
import { useProjectStore } from '@/store/projectStore';
import { CustomAttribute, CustomAttributeType } from '@/models/project';
import { uuid } from '@/utils/uuid';
import { Sliders, Plus, Trash2, X, Check } from 'lucide-react';

interface AttributeSchemaDialogProps {
  onClose: () => void;
}

export const AttributeSchemaDialog: React.FC<AttributeSchemaDialogProps> = ({ onClose }) => {
  const project = useProjectStore(s => s.project);
  const setAttributeSchema = useProjectStore(s => s.setAttributeSchema);

  const [schema, setSchema] = useState<CustomAttribute[]>(
    project?.attributeSchema ? structuredClone(project.attributeSchema) : []
  );

  const [newNama, setNewNama] = useState('');
  const [newTipe, setNewTipe] = useState<CustomAttributeType>('text');
  const [newWajib, setNewWajib] = useState(false);

  if (!project) return null;

  const handleAdd = () => {
    if (!newNama.trim()) return;

    const attr: CustomAttribute = {
      id: uuid(),
      nama: newNama.trim(),
      tipe: newTipe,
      wajib: newWajib,
    };

    setSchema(prev => [...prev, attr]);
    setNewNama('');
    setNewWajib(false);
  };

  const handleRemove = (id: string) => {
    setSchema(prev => prev.filter(a => a.id !== id));
  };

  const handleSave = () => {
    setAttributeSchema(schema);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-w-lg w-full flex flex-col text-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950/40">
          <div className="flex items-center space-x-2 font-semibold text-sm text-slate-100">
            <Sliders className="w-4 h-4 text-blue-400" />
            <span>Skema Atribut Khusus Proyek</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 text-xs max-h-[60vh] overflow-y-auto">
          {/* Add New Attribute Row */}
          <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg space-y-2">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
              Tambah Atribut Baru
            </span>

            <div className="grid grid-cols-3 gap-2">
              <input
                type="text"
                placeholder="Nama atribut (mis. Lokasi)"
                value={newNama}
                onChange={e => setNewNama(e.target.value)}
                className="col-span-2 bg-slate-800 border border-slate-700 text-slate-100 rounded px-2.5 py-1 text-xs outline-none focus:border-blue-500"
              />

              <select
                value={newTipe}
                onChange={e => setNewTipe(e.target.value as CustomAttributeType)}
                className="bg-slate-800 border border-slate-700 text-slate-100 rounded px-2 py-1 text-xs"
              >
                <option value="text">Teks</option>
                <option value="number">Angka</option>
                <option value="dropdown">Dropdown</option>
                <option value="boolean">Boolean</option>
                <option value="date">Tanggal</option>
                <option value="multiline">Teks Panjang</option>
              </select>
            </div>

            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center space-x-2 cursor-pointer text-slate-300">
                <input
                  type="checkbox"
                  checked={newWajib}
                  onChange={e => setNewWajib(e.target.checked)}
                  className="rounded bg-slate-800 border-slate-700 text-blue-600 focus:ring-0"
                />
                <span>Wajib diisi</span>
              </label>

              <button
                disabled={!newNama.trim()}
                onClick={handleAdd}
                className="flex items-center space-x-1 px-3 py-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded font-medium shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah</span>
              </button>
            </div>
          </div>

          {/* Current Attributes List */}
          <div className="space-y-2">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
              Daftar Atribut Terdaftar ({schema.length})
            </span>

            {schema.length === 0 ? (
              <div className="py-4 text-center text-slate-500 italic">
                Belum ada atribut khusus yang ditambahkan.
              </div>
            ) : (
              schema.map(attr => (
                <div
                  key={attr.id}
                  className="flex items-center justify-between p-2.5 bg-slate-950/40 border border-slate-800 rounded-lg"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center space-x-2 font-medium text-slate-200">
                      <span>{attr.nama}</span>
                      {attr.wajib && (
                        <span className="text-[9px] bg-amber-950 text-amber-400 border border-amber-800/60 px-1.5 py-0.2 rounded font-mono">
                          Wajib
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] font-mono text-slate-400">
                      Tipe: {attr.tipe} · ID: {attr.id.slice(0, 8)}
                    </div>
                  </div>

                  <button
                    onClick={() => handleRemove(attr.id)}
                    className="p-1.5 bg-slate-800 hover:bg-rose-900/40 text-slate-400 hover:text-rose-300 rounded"
                    title="Hapus Atribut"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end space-x-2 px-4 py-3 border-t border-slate-800 bg-slate-950/60">
          <button
            onClick={onClose}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs"
          >
            Batal
          </button>
          <button
            onClick={handleSave}
            className="flex items-center space-x-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-medium shadow-sm"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Simpan Skema</span>
          </button>
        </div>
      </div>
    </div>
  );
};
