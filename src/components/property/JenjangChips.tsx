import React from 'react';
import { OrgNode } from '@/models/node';
import { getJenjangOptions, jenjangLabel } from '@/config/resolver';
import { useProjectStore } from '@/store/projectStore';
import { useUiStore } from '@/store/uiStore';

interface JenjangChipsProps {
  node: OrgNode;
}

export const JenjangChips: React.FC<JenjangChipsProps> = ({ node }) => {
  const options = getJenjangOptions(node.kategoriId, node.rumpun);
  const addRincian = useProjectStore(s => s.addRincian);
  const removeRincian = useProjectStore(s => s.removeRincian);
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
