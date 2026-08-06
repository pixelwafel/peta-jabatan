import React, { useMemo, useState } from 'react';
import { OrgNode } from '@/models/node';
import { useProjectStore } from '@/store/projectStore';
import { useUiStore } from '@/store/uiStore';
import { subtreeOf } from '@/selectors/navigation';
import { jenjangLabel } from '@/config/resolver';
import { NumberInput } from './NumberInput';
import { LayoutGrid, Plus, Trash2, Copy, Undo2 } from 'lucide-react';

interface TemplateEditorProps {
  node: OrgNode;
  /** unit ini punya children — cuma info tampilan, template BOLEH punya children (doc 15 §1). */
  hasChildren: boolean;
}

interface ColumnDef {
  key: string; // rincianId, atau id unit untuk kolom kepala unit
  label: string;
}

/** Kolom yang berlaku untuk template ini — persis logika store/projectStore.ts purgeInstanceColumns. */
function buildColumns(node: OrgNode, nodes: OrgNode[], edges: import('@/models/edge').OrgEdge[]): ColumnDef[] {
  const cols: ColumnDef[] = [];
  for (const n of subtreeOf(nodes, edges, node.id)) {
    if (n.type === 'unit' && n.kepalaUnit) {
      cols.push({ key: n.id, label: `Kepala ${n.nama}` });
    } else if (n.type === 'jabatan') {
      for (const r of n.rincian) {
        cols.push({
          key: r.id,
          label: r.jenjangId ? `${n.nama} · ${jenjangLabel(r.jenjangId, n.kategoriId)}` : n.nama,
        });
      }
    }
  }
  return cols;
}

export const TemplateEditor: React.FC<TemplateEditorProps> = ({ node, hasChildren }) => {
  const project = useProjectStore(s => s.project);
  const makeTemplate = useProjectStore(s => s.makeTemplate);
  const unmakeTemplate = useProjectStore(s => s.unmakeTemplate);
  const addInstance = useProjectStore(s => s.addInstance);
  const duplicateInstance = useProjectStore(s => s.duplicateInstance);
  const removeInstance = useProjectStore(s => s.removeInstance);
  const updateInstanceFigure = useProjectStore(s => s.updateInstanceFigure);
  const openConfirm = useUiStore(s => s.openConfirm);
  const showToast = useUiStore(s => s.showToast);

  const [picking, setPicking] = useState(false);
  const [newInstanceName, setNewInstanceName] = useState('');

  const nodes = project?.nodes ?? [];
  const edges = project?.edges ?? [];

  const columns = useMemo(() => (node.isTemplate ? buildColumns(node, nodes, edges) : []), [node, nodes, edges]);

  const instances = useMemo(
    () => (project?.instances ?? []).filter(i => i.templateNodeId === node.id),
    [project?.instances, node.id]
  );

  const subtreeHasFigures = useMemo(() => {
    if (node.isTemplate) return false;
    return subtreeOf(nodes, edges, node.id).some(
      n =>
        (n.type === 'unit' && n.kepalaUnit && (n.kepalaUnit.kebutuhan !== 0 || n.kepalaUnit.eksisting !== 0)) ||
        (n.type === 'jabatan' && n.rincian.some(r => r.kebutuhan !== 0 || r.eksisting !== 0))
    );
  }, [node, nodes, edges]);

  if (!node.isTemplate) {
    if (!picking) {
      return (
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="w-full flex items-center justify-center space-x-1.5 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-medium border border-dashed border-slate-700"
        >
          <LayoutGrid className="w-3.5 h-3.5 text-teal-400" />
          <span>Jadikan Template…</span>
        </button>
      );
    }

    const handlePick = (seed: 'seed' | 'zero') => {
      const result = makeTemplate(node.id, seed);
      if (!result.ok) {
        showToast(
          result.reason === 'nested'
            ? 'Unit ini sudah di dalam subtree template lain — tidak boleh bersarang.'
            : result.reason === 'is-link'
            ? 'Unit ini adalah tautan — putuskan dulu sebelum jadi template.'
            : 'Gagal menjadikan template.',
          'error'
        );
      }
      setPicking(false);
    };

    return (
      <div className="space-y-2 rounded-lg border border-teal-900/50 bg-teal-950/10 p-2.5">
        <label className="text-[10px] font-semibold text-teal-300 uppercase tracking-wider">
          Jadikan Template
        </label>
        <p className="text-[11px] text-slate-400">
          Struktur di bawah unit ini jadi kolom bersama untuk banyak satuan (docs/15
          — kasus sekolah). Angka kebutuhan/eksisting berpindah dari baris ke tabel satuan.
        </p>
        {subtreeHasFigures ? (
          <div className="space-y-1.5">
            <p className="text-[11px] text-amber-300">
              Subtree ini sudah punya angka — pilih mau dibawa ke satuan pertama, atau dinolkan:
            </p>
            <div className="flex items-center space-x-1.5">
              <button
                type="button"
                onClick={() => handlePick('seed')}
                className="flex-1 px-2 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-[11px] font-medium"
              >
                Jadikan 1 satuan awal
              </button>
              <button
                type="button"
                onClick={() => handlePick('zero')}
                className="flex-1 px-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] font-medium"
              >
                Nolkan saja
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => handlePick('zero')}
            className="w-full px-2 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-[11px] font-medium"
          >
            Jadikan Template
          </button>
        )}
        <button
          type="button"
          onClick={() => setPicking(false)}
          className="w-full px-2 py-1 text-slate-500 hover:text-slate-300 text-[11px]"
        >
          Batal
        </button>
      </div>
    );
  }

  const handleUnmake = () => {
    const relevant = instances.length;
    if (relevant > 1) {
      showToast(`Ada ${relevant} satuan — hapus atau ekspor dulu sampai tersisa 1 sebelum batalkan template.`, 'error');
      return;
    }
    openConfirm({
      title: 'Batalkan template?',
      body:
        relevant === 1
          ? `Angka satuan "${instances[0].nama}" akan dilipat balik ke baris struktur, lalu unit ini kembali jadi unit biasa.`
          : 'Unit ini akan kembali jadi unit biasa (belum ada satuan yang perlu dilipat).',
      confirmLabel: 'Batalkan Template',
      danger: true,
      onConfirm: () => unmakeTemplate(node.id),
    });
  };

  const handleRemoveInstance = (instanceId: string, nama: string) => {
    openConfirm({
      title: `Hapus satuan "${nama}"?`,
      body: 'Seluruh angka pada satuan ini akan hilang.',
      confirmLabel: 'Hapus',
      danger: true,
      onConfirm: () => removeInstance(instanceId),
    });
  };

  return (
    <div className="space-y-2 rounded-lg border border-teal-900/50 bg-teal-950/10 p-2.5">
      <div className="flex items-center justify-between pb-1 border-b border-teal-900/40">
        <span className="flex items-center space-x-1.5 text-[10px] font-semibold text-teal-300 uppercase tracking-wider">
          <LayoutGrid className="w-3.5 h-3.5" />
          <span>Template — {instances.length} satuan</span>
        </span>
        <button
          type="button"
          onClick={handleUnmake}
          className="flex items-center space-x-1 text-[10px] text-rose-400 hover:text-rose-300"
          title="Batalkan template"
        >
          <Undo2 className="w-3 h-3" />
          <span>Batalkan</span>
        </button>
      </div>

      {columns.length === 0 ? (
        <p className="text-[11px] text-slate-500 italic">
          Belum ada posisi di bawah unit ini — tambah jabatan/kepala unit dulu supaya ada kolom untuk diisi per satuan.
        </p>
      ) : (
        <div className="overflow-x-auto -mx-2.5">
          <table className="text-[11px] font-mono border-collapse w-full">
            <thead>
              <tr className="text-slate-400">
                <th className="sticky left-0 bg-teal-950/30 text-left px-2 py-1 font-medium">Satuan</th>
                {columns.map(c => (
                  <th key={c.key} className="px-1.5 py-1 font-medium text-center whitespace-nowrap" title={c.label}>
                    {c.label.length > 14 ? `${c.label.slice(0, 13)}…` : c.label}
                  </th>
                ))}
                <th className="px-1 py-1" />
              </tr>
            </thead>
            <tbody className="divide-y divide-teal-900/30">
              {instances.map(inst => (
                <tr key={inst.id} className="hover:bg-teal-950/20">
                  <td className="sticky left-0 bg-slate-950/80 px-2 py-1 text-slate-200 truncate max-w-[120px]" title={inst.nama}>
                    {inst.nama}
                  </td>
                  {columns.map(c => {
                    const fig = inst.figures[c.key] ?? { kebutuhan: 0, eksisting: 0 };
                    return (
                      <td key={c.key} className="px-1 py-1">
                        <div className="flex items-center space-x-0.5">
                          <NumberInput
                            value={fig.kebutuhan}
                            onChange={v => updateInstanceFigure(inst.id, c.key, { kebutuhan: v }, `inst:${inst.id}:${c.key}:keb`)}
                          />
                          <span className="text-slate-600">/</span>
                          <NumberInput
                            value={fig.eksisting}
                            onChange={v => updateInstanceFigure(inst.id, c.key, { eksisting: v }, `inst:${inst.id}:${c.key}:eks`)}
                          />
                        </div>
                      </td>
                    );
                  })}
                  <td className="px-1 py-1">
                    <div className="flex items-center space-x-1">
                      <button
                        type="button"
                        onClick={() => duplicateInstance(inst.id)}
                        title="Duplikat satuan"
                        className="text-slate-500 hover:text-blue-400"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveInstance(inst.id, inst.nama)}
                        title="Hapus satuan"
                        className="text-slate-500 hover:text-rose-400"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center space-x-1.5 pt-1">
        <input
          type="text"
          placeholder="Nama satuan baru, mis. SDN 03 Kota Timur"
          value={newInstanceName}
          onChange={e => setNewInstanceName(e.target.value)}
          className="flex-1 bg-slate-800 border border-slate-700 text-slate-100 rounded px-2 py-1 text-[11px] outline-none focus:border-blue-500"
        />
        <button
          type="button"
          onClick={() => {
            if (!newInstanceName.trim()) return;
            addInstance(node.id, newInstanceName.trim());
            setNewInstanceName('');
          }}
          disabled={!newInstanceName.trim()}
          className="flex items-center space-x-1 px-2 py-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded text-[11px] font-medium"
        >
          <Plus className="w-3 h-3" />
          <span>Tambah</span>
        </button>
      </div>

      {hasChildren && (
        <p className="text-[10px] text-slate-500">
          Sub-unit di bawah template ini ikut jadi kolom (mis. Tata Usaha) — lihat tabel di atas.
        </p>
      )}
    </div>
  );
};
