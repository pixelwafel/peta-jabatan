import React, { useMemo, useState } from 'react';
import { OrgNode } from '@/models/node';
import { useProjectStore } from '@/store/projectStore';
import { useUiStore } from '@/store/uiStore';
import { subtreeOf } from '@/selectors/navigation';
import { LayoutGrid, Undo2, ArrowRight } from 'lucide-react';

interface TemplateEditorProps {
  node: OrgNode;
  /** unit ini punya children — cuma info tampilan, template BOLEH punya children (doc 15 §1). */
  hasChildren: boolean;
}

/**
 * Panel properti hanya menangani status/trigger template (jadikan/batalkan
 * template) — tabel isi angka per satuan TIDAK lagi dirender di sini (dulu
 * duplikat persis dengan InstanceGrid.tsx, terjejal di kolom 380px dengan
 * scroll horizontal). Editing sesungguhnya sepenuhnya di tab "Satuan"
 * (StructurePanel), lebar penuh + virtualized — panel ini cuma jembatan ke
 * sana lewat `openSatuanTab` (docs/15-template-instance.md §2, §6).
 */
export const TemplateEditor: React.FC<TemplateEditorProps> = ({ node, hasChildren }) => {
  const project = useProjectStore(s => s.project);
  const makeTemplate = useProjectStore(s => s.makeTemplate);
  const unmakeTemplate = useProjectStore(s => s.unmakeTemplate);
  const openConfirm = useUiStore(s => s.openConfirm);
  const showToast = useUiStore(s => s.showToast);
  const openSatuanTab = useUiStore(s => s.openSatuanTab);

  const [picking, setPicking] = useState(false);

  const nodes = project?.nodes ?? [];
  const edges = project?.edges ?? [];

  const instanceCount = useMemo(
    () => (project?.instances ?? []).filter(i => i.templateNodeId === node.id).length,
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
      } else {
        openSatuanTab(node.id);
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
    const relevant = instanceCount;
    if (relevant > 1) {
      showToast(`Ada ${relevant} satuan — hapus atau ekspor dulu sampai tersisa 1 sebelum batalkan template.`, 'error');
      return;
    }
    openConfirm({
      title: 'Batalkan template?',
      body:
        relevant === 1
          ? 'Angka satuan yang tersisa akan dilipat balik ke baris struktur, lalu unit ini kembali jadi unit biasa.'
          : 'Unit ini akan kembali jadi unit biasa (belum ada satuan yang perlu dilipat).',
      confirmLabel: 'Batalkan Template',
      danger: true,
      onConfirm: () => unmakeTemplate(node.id),
    });
  };

  return (
    <div className="space-y-2 rounded-lg border border-teal-900/50 bg-teal-950/10 p-2.5">
      <div className="flex items-center justify-between pb-1 border-b border-teal-900/40">
        <span className="flex items-center space-x-1.5 text-[10px] font-semibold text-teal-300 uppercase tracking-wider">
          <LayoutGrid className="w-3.5 h-3.5" />
          <span>Template — {instanceCount} satuan</span>
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

      <p className="text-[11px] text-slate-400">
        Isi/edit angka per satuan (mis. per sekolah) dilakukan di tab "Satuan" — lebih lega, tidak
        terjejal di panel ini.
      </p>

      <button
        type="button"
        onClick={() => openSatuanTab(node.id)}
        className="w-full flex items-center justify-center space-x-1.5 px-2.5 py-1.5 bg-teal-600 hover:bg-teal-500 text-white rounded text-[11px] font-medium"
      >
        <span>Buka di tab Satuan</span>
        <ArrowRight className="w-3.5 h-3.5" />
      </button>

      {hasChildren && (
        <p className="text-[10px] text-slate-500">
          Sub-unit di bawah template ini ikut jadi kolom di tab Satuan (mis. Tata Usaha).
        </p>
      )}
    </div>
  );
};
