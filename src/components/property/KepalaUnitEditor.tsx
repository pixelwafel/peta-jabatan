import React from 'react';
import { OrgNode } from '@/models/node';
import { NodeTotals } from '@/models/derived';
import { useProjectStore } from '@/store/projectStore';
import { useUiStore } from '@/store/uiStore';
import { getJenjangOptions } from '@/config/resolver';
import { columnBlastRadius } from '@/selectors/templateInstance';
import { NumberInput } from './NumberInput';
import { Plus, Trash2 } from 'lucide-react';

interface KepalaUnitEditorProps {
  node: OrgNode;
  /** Terisi kalau unit ini sub-unit di DALAM subtree template (docs/15-template-instance.md
   * §3) — bukan template root-nya sendiri (itu ditangani TemplateEditor).
   * Angka kebutuhan/eksisting jadi read-only, bersumber dari kolom instance. */
  templateContext?: { templateNodeId: string; totals: Map<string, NodeTotals> } | null;
}

/**
 * Posisi kepala unit (kategori struktural) melekat langsung pada node Unit —
 * bukan node Jabatan terpisah. Node Jabatan (di bawah unit ini) hanya untuk
 * Fungsional & Pelaksana.
 */
export const KepalaUnitEditor: React.FC<KepalaUnitEditorProps> = ({ node, templateContext }) => {
  const setKepalaUnit = useProjectStore(s => s.setKepalaUnit);
  const project = useProjectStore(s => s.project);
  const openConfirm = useUiStore(s => s.openConfirm);
  const jenjangOptions = getJenjangOptions('struktural', []);
  const kepala = node.kepalaUnit;

  const handleDelete = () => {
    if (!templateContext) {
      setKepalaUnit(node.id, null);
      return;
    }
    // Doc 15 §2/§7: blast radius dari kolom instance (keyed id unit ini
    // sendiri), BUKAN kepala.kebutuhan/eksisting (selalu nol di template).
    const radius = columnBlastRadius(project?.instances ?? [], templateContext.templateNodeId, node.id);
    if (radius.instanceCount === 0) {
      setKepalaUnit(node.id, null);
      return;
    }
    openConfirm({
      title: 'Hapus kepala unit?',
      body: `Menghapus kolom ini akan menghapus angka pada ${radius.instanceCount} satuan (total kebutuhan ${radius.totalKebutuhan}, eksisting ${radius.totalEksisting}).`,
      confirmLabel: 'Hapus',
      danger: true,
      onConfirm: () => setKepalaUnit(node.id, null),
    });
  };

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
          onClick={handleDelete}
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

        {templateContext ? (
          (() => {
            const t = templateContext.totals.get(node.id) ?? { kebutuhan: 0, eksisting: 0, selisih: 0 };
            return (
              <>
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-500">Kebutuhan (Σ satuan)</label>
                  <div className="w-full bg-slate-900 border border-teal-900/50 text-teal-300 rounded px-2.5 py-1.5 text-xs font-mono text-center">
                    {t.kebutuhan}
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-500">Eksisting (Σ satuan)</label>
                  <div className="w-full bg-slate-900 border border-teal-900/50 text-teal-300 rounded px-2.5 py-1.5 text-xs font-mono text-center">
                    {t.eksisting}
                  </div>
                </div>
              </>
            );
          })()
        ) : (
          <>
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
          </>
        )}
      </div>
    </div>
  );
};
