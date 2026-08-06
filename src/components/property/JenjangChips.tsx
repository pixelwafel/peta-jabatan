import React from 'react';
import { OrgNode } from '@/models/node';
import { NodeTotals } from '@/models/derived';
import { getJenjangOptions, jenjangLabel } from '@/config/resolver';
import { useProjectStore } from '@/store/projectStore';
import { useUiStore } from '@/store/uiStore';
import { columnBlastRadius } from '@/selectors/templateInstance';

interface JenjangChipsProps {
  node: OrgNode;
  /** Terisi kalau node ini di dalam subtree template (docs/15-template-instance.md
   * §2/§7) — blast-radius konfirmasi hapus HARUS baca dari sini, bukan dari
   * r.kebutuhan/r.eksisting (selalu nol by invariant di sana). */
  templateContext?: { templateNodeId: string; totals: Map<string, NodeTotals> } | null;
}

export const JenjangChips: React.FC<JenjangChipsProps> = ({ node, templateContext }) => {
  const options = getJenjangOptions(node.kategoriId, node.rumpun);
  const addRincian = useProjectStore(s => s.addRincian);
  const removeRincian = useProjectStore(s => s.removeRincian);
  const project = useProjectStore(s => s.project);
  const openConfirm = useUiStore(s => s.openConfirm);

  if (options.length === 0) return null;

  const activeJenjangIds = new Set(
    node.rincian.map(r => r.jenjangId).filter(Boolean)
  );

  const handleToggle = (jenjangId: string) => {
    const existing = node.rincian.find(r => r.jenjangId === jenjangId);

    if (!existing) {
      addRincian(node.id, jenjangId);
      return;
    }

    if (templateContext) {
      // Doc 15 §2/§7: blast radius = seluruh instance template ini yang
      // punya angka di kolom (rincianId) ini, BUKAN r.kebutuhan/eksisting
      // node-nya sendiri (selalu nol di dalam template).
      const radius = columnBlastRadius(project?.instances ?? [], templateContext.templateNodeId, existing.id);
      if (radius.instanceCount === 0) {
        removeRincian(node.id, existing.id);
        return;
      }
      openConfirm({
        title: `Hapus jenjang ${jenjangLabel(jenjangId, node.kategoriId)}?`,
        body: `Menghapus jenjang ini akan menghapus angka pada ${radius.instanceCount} satuan (total kebutuhan ${radius.totalKebutuhan}, eksisting ${radius.totalEksisting}).`,
        confirmLabel: 'Hapus',
        danger: true,
        onConfirm: () => removeRincian(node.id, existing.id),
      });
      return;
    }

    if (existing.kebutuhan === 0 && existing.eksisting === 0) {
      removeRincian(node.id, existing.id);
      return;
    }

    // Confirmation when non-zero data would be lost (doc 06 §2)
    openConfirm({
      title: `Hapus jenjang ${jenjangLabel(jenjangId, node.kategoriId)}?`,
      body: `Baris ini berisi kebutuhan ${existing.kebutuhan} dan eksisting ${existing.eksisting}. Angka tersebut akan hilang.`,
      confirmLabel: 'Hapus',
      danger: true,
      onConfirm: () => removeRincian(node.id, existing.id),
    });
  };

  return (
    <div className="space-y-1.5">
      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
        Jenjang yang ada:
      </span>
      <div className="flex flex-wrap gap-1.5">
        {options.map(j => {
          const isActive = activeJenjangIds.has(j.id);
          return (
            <button
              key={j.id}
              type="button"
              onClick={() => handleToggle(j.id)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors border select-none ${
                isActive
                  ? 'bg-blue-600/20 text-blue-300 border-blue-500/50 shadow-sm'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200 hover:bg-slate-700/60'
              }`}
            >
              {isActive ? `✓ ${j.nama}` : j.nama}
            </button>
          );
        })}
      </div>
    </div>
  );
};
