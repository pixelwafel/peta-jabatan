import React from 'react';
import { OrgNode, Rumpun } from '@/models/node';
import {
  getKategoriList,
  getKategori,
  isJenjangValid,
  getJenjangOptions,
} from '@/config/resolver';
import { useProjectStore } from '@/store/projectStore';
import { useUiStore } from '@/store/uiStore';

interface ClassificationEditorProps {
  node: OrgNode;
}

export const ClassificationEditor: React.FC<ClassificationEditorProps> = ({ node }) => {
  const setKategori = useProjectStore(s => s.setKategori);
  const setRumpun = useProjectStore(s => s.setRumpun);
  const openConfirm = useUiStore(s => s.openConfirm);

  const currentKat = getKategori(node.kategoriId);

  const handleKategoriChange = (nextKategoriId: string) => {
    if (nextKategoriId === node.kategoriId) return;

    // Check if any rincian row has a jenjangId invalid for the new category
    const invalidated = node.rincian.filter(
      r => r.jenjangId && !isJenjangValid(nextKategoriId, node.rumpun, r.jenjangId)
    );

    if (invalidated.length === 0) {
      setKategori(node.id, nextKategoriId);
      return;
    }

    const nextKat = getKategori(nextKategoriId);

    openConfirm({
      title: 'Ubah kategori jabatan?',
      body: `${invalidated.length} baris jenjang tidak berlaku pada kategori ${nextKat?.nama ?? nextKategoriId}. Angkanya dipertahankan, tetapi jenjangnya dikosongkan dan perlu dipilih ulang.`,
      confirmLabel: 'Ubah Kategori',
      onConfirm: () => setKategori(node.id, nextKategoriId),
    });
  };

  const handleRumpunToggle = (r: Rumpun) => {
    const nextRumpun = node.rumpun.includes(r)
      ? node.rumpun.filter(x => x !== r)
      : [...node.rumpun, r];

    const stillValidIds = new Set(
      getJenjangOptions(node.kategoriId, nextRumpun).map(j => j.id)
    );

    const doomedRows = node.rincian.filter(
      x => x.jenjangId && !stillValidIds.has(x.jenjangId)
    );

    const rowsWithData = doomedRows.filter(
      x => x.kebutuhan > 0 || x.eksisting > 0
    );

    if (rowsWithData.length === 0) {
      setRumpun(node.id, nextRumpun);
      return;
    }

    const totalKeb = rowsWithData.reduce((sum, x) => sum + x.kebutuhan, 0);
    const totalEks = rowsWithData.reduce((sum, x) => sum + x.eksisting, 0);
    const rumpunLabel = r === 'keahlian' ? 'Keahlian' : 'Keterampilan';

    openConfirm({
      title: `Hapus rumpun ${rumpunLabel}?`,
      body: `${rowsWithData.length} baris jenjang akan dihapus (kebutuhan ${totalKeb}, eksisting ${totalEks}).`,
      confirmLabel: 'Hapus Rumpun',
      danger: true,
      onConfirm: () => setRumpun(node.id, nextRumpun),
    });
  };

  return (
    <div className="space-y-3">
      {/* Category Select */}
      <div className="space-y-1">
        <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
          Kategori Jabatan
        </label>
        <select
          value={node.kategoriId ?? ''}
          onChange={e => handleKategoriChange(e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 text-slate-100 rounded px-2.5 py-1.5 text-xs outline-none focus:border-blue-500 transition-colors"
        >
          <option value="">— Pilih Kategori —</option>
          {/* Struktural bukan pilihan di sini — kepala unit melekat pada node
              Unit induknya, lihat bagian "Kepala Unit" di properti Unit. */}
          {getKategoriList()
            .filter(k => k.id !== 'struktural')
            .map(k => (
              <option key={k.id} value={k.id}>
                {k.nama}
              </option>
            ))}
        </select>
      </div>

      {/* Rumpun Multi-select Chips */}
      {currentKat?.punyaRumpun && (
        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
            Rumpun (Track)
          </label>
          <div className="flex space-x-2">
            <button
              type="button"
              onClick={() => handleRumpunToggle('keahlian')}
              className={`flex-1 py-1 px-2 rounded text-xs font-medium border transition-colors ${
                node.rumpun.includes('keahlian')
                  ? 'bg-emerald-600/20 text-emerald-300 border-emerald-500/50'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
              }`}
            >
              {node.rumpun.includes('keahlian') ? '✓ Keahlian' : 'Keahlian'}
            </button>
            <button
              type="button"
              onClick={() => handleRumpunToggle('keterampilan')}
              className={`flex-1 py-1 px-2 rounded text-xs font-medium border transition-colors ${
                node.rumpun.includes('keterampilan')
                  ? 'bg-emerald-600/20 text-emerald-300 border-emerald-500/50'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
              }`}
            >
              {node.rumpun.includes('keterampilan') ? '✓ Keterampilan' : 'Keterampilan'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
