import React from 'react';
import { OrgNode } from '@/models/node';
import { useProjectStore } from '@/store/projectStore';
import { getJenjangOptions } from '@/config/resolver';
import { NumberInput } from './NumberInput';
import { Plus, Trash2 } from 'lucide-react';

interface KepalaUnitEditorProps {
  node: OrgNode;
}

/**
 * Posisi kepala unit (kategori struktural) melekat langsung pada node Unit —
 * bukan node Jabatan terpisah. Node Jabatan (di bawah unit ini) hanya untuk
 * Fungsional & Pelaksana.
 */
export const KepalaUnitEditor: React.FC<KepalaUnitEditorProps> = ({ node }) => {
  const setKepalaUnit = useProjectStore(s => s.setKepalaUnit);
  const jenjangOptions = getJenjangOptions('struktural', []);
  const kepala = node.kepalaUnit;

  if (!kepala) {
    return (
      <div className="space-y-1.5">
        <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
          Kepala Unit
        </label>
        <button
          type="button"
          onClick={() =>
            setKepalaUnit(node.id, { jenjangId: null, kebutuhan: 1, eksisting: 0 })
          }
          className="w-full flex items-center justify-center space-x-1.5 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-medium border border-dashed border-slate-700"
        >
          <Plus className="w-3.5 h-3.5 text-blue-400" />
          <span>Tambah Kepala Unit (Struktural)</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
          Kepala Unit (Struktural)
        </label>
        <button
          type="button"
          onClick={() => setKepalaUnit(node.id, null)}
          className="flex items-center space-x-1 text-[10px] text-rose-400 hover:text-rose-300"
          title="Hapus kepala unit"
        >
          <Trash2 className="w-3 h-3" />
          <span>Hapus</span>
        </button>
      </div>

      <input
        type="text"
        placeholder={`Kepala ${node.nama || 'Unit'}`}
        value={kepala.nama ?? ''}
        onChange={e => setKepalaUnit(node.id, { nama: e.target.value || undefined })}
        className="w-full bg-slate-800 border border-slate-700 text-slate-100 rounded px-2.5 py-1.5 text-xs outline-none focus:border-blue-500"
      />

      <div className="grid grid-cols-2 gap-2">
        <select
          value={kepala.jenjangId ?? ''}
          onChange={e => setKepalaUnit(node.id, { jenjangId: e.target.value || null })}
          className="col-span-2 w-full bg-slate-800 border border-slate-700 text-slate-100 rounded px-2.5 py-1.5 text-xs outline-none focus:border-blue-500"
        >
          <option value="">— Pilih Jenjang —</option>
          {jenjangOptions.map(j => (
            <option key={j.id} value={j.id}>
              {j.nama}
            </option>
          ))}
        </select>

        <input
          type="text"
          placeholder="Kode posisi"
          value={kepala.kode ?? ''}
          onChange={e => setKepalaUnit(node.id, { kode: e.target.value || undefined })}
          className="col-span-2 w-full bg-slate-800 border border-slate-700 text-slate-100 rounded px-2.5 py-1.5 text-xs outline-none focus:border-blue-500 font-mono"
        />

        <div className="space-y-1">
          <label className="text-[10px] text-slate-500">Kebutuhan</label>
          <NumberInput
            value={kepala.kebutuhan}
            onChange={v => setKepalaUnit(node.id, { kebutuhan: v })}
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] text-slate-500">Eksisting</label>
          <NumberInput
            value={kepala.eksisting}
            onChange={v => setKepalaUnit(node.id, { eksisting: v })}
          />
        </div>
      </div>
    </div>
  );
};
