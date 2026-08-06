import React from 'react';
import { useRecap } from '@/hooks/useRecap';
import { useReactFlow } from '@xyflow/react';
import { useProjectStore } from '@/store/projectStore';
import { useUiStore } from '@/store/uiStore';
import { ancestorsOf } from '@/selectors/navigation';
import { NODE_W, nodeHeight } from '@/utils/layout';
import { BarChart3, Building, Tag, Award } from 'lucide-react';

export const RecapPanel: React.FC = () => {
  const recap = useRecap();
  const project = useProjectStore(s => s.project);
  const updateNode = useProjectStore(s => s.updateNode);
  const selectNodes = useUiStore(s => s.selectNodes);
  const showJenjangOnCard = useUiStore(s => s.showJenjangOnCard);
  const { setCenter } = useReactFlow();

  if (!recap || !project) {
    return (
      <div className="p-4 text-xs text-slate-500 italic text-center">
        Tidak ada data proyek untuk ditampilkan.
      </div>
    );
  }

  const { total, unplaced, perUnit, perKategori, perJenjang } = recap;

  const handleFocusNode = (nodeId: string) => {
    // 1. Expand collapsed ancestors first (doc 05 §6)
    const collapsedAncestors = ancestorsOf(project.nodes, project.edges, nodeId).filter(
      a => a.collapsed
    );
    if (collapsedAncestors.length > 0) {
      for (const a of collapsedAncestors) {
        updateNode(a.id, { collapsed: false });
      }
    }

    // 2. Center canvas & select node
    const targetNode = project.nodes.find(n => n.id === nodeId);
    if (targetNode) {
      const h = nodeHeight(targetNode, showJenjangOnCard);
      setCenter(targetNode.position.x + NODE_W / 2, targetNode.position.y + h / 2, {
        zoom: 1.2,
        duration: 300,
      });
      selectNodes([nodeId]);
    }
  };

  const formatSelisih = (sel: number) => {
    if (sel > 0) return `+${sel}`;
    return sel.toString();
  };

  const selisihColor = (sel: number) => {
    if (sel < 0) return 'text-red-400 font-semibold';
    if (sel > 0) return 'text-amber-400 font-semibold';
    return 'text-slate-400';
  };

  return (
    <div className="space-y-4 text-xs select-none pb-4 font-mono">
      {/* 1. Total OPD Summary Box */}
      <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-3 space-y-2">
        <div className="flex items-center justify-between font-bold text-slate-200 border-b border-slate-800/80 pb-1.5 text-xs">
          <div className="flex items-center space-x-1.5">
            <BarChart3 className="w-4 h-4 text-blue-400" />
            <span>{total.label}</span>
          </div>
          <span className="text-[10px] text-slate-500 font-normal">
            ({total.nodeCount} jabatan)
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="bg-slate-900/80 rounded p-1.5 border border-slate-800">
            <span className="text-[10px] text-slate-500 block uppercase">Kebutuhan</span>
            <span className="font-bold text-slate-200">{total.kebutuhan}</span>
          </div>
          <div className="bg-slate-900/80 rounded p-1.5 border border-slate-800">
            <span className="text-[10px] text-slate-500 block uppercase">Eksisting</span>
            <span className="font-bold text-slate-200">{total.eksisting}</span>
          </div>
          <div className="bg-slate-900/80 rounded p-1.5 border border-slate-800">
            <span className="text-[10px] text-slate-500 block uppercase">Selisih</span>
            <span className={`font-bold ${selisihColor(total.selisih)}`}>
              {formatSelisih(total.selisih)}
            </span>
          </div>
        </div>

        {unplaced.nodeCount > 0 && (
          <div className="mt-1 pt-1.5 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
            <span className="text-amber-400/90 font-medium">⚠️ {unplaced.label}</span>
            <span className="text-slate-400">
              Keb {unplaced.kebutuhan} · Eks {unplaced.eksisting} ·{' '}
              <span className={selisihColor(unplaced.selisih)}>
                {formatSelisih(unplaced.selisih)}
              </span>
            </span>
          </div>
        )}
      </div>

      {/* 2. Per Unit Section */}
      <div className="space-y-1.5">
        <div className="flex items-center space-x-1.5 text-slate-400 font-semibold text-[10px] uppercase tracking-wider">
          <Building className="w-3.5 h-3.5" />
          <span>Rekapitulasi Per Unit Organisasi</span>
        </div>
        <div className="border border-slate-800 rounded-lg overflow-hidden bg-slate-950/40">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-900 border-b border-slate-800 text-slate-400 text-[10px]">
                <th className="py-1.5 px-2 text-left font-medium">Unit Kerja</th>
                <th className="py-1.5 px-1 text-center w-10 font-medium">Keb</th>
                <th className="py-1.5 px-1 text-center w-10 font-medium">Eks</th>
                <th className="py-1.5 px-2 text-right w-10 font-medium">Sel</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {perUnit.map(u => (
                <tr
                  key={u.key}
                  onClick={() => handleFocusNode(u.key)}
                  className="hover:bg-slate-800/60 cursor-pointer transition-colors"
                >
                  <td className="py-1 px-2 text-slate-200 truncate max-w-[140px]" title={u.label}>
                    <span style={{ paddingLeft: `${(u.depth ?? 0) * 10}px` }}>
                      {u.depth && u.depth > 0 ? '├ ' : ''}
                      {u.label}
                    </span>
                  </td>
                  <td className="py-1 px-1 text-center text-slate-300">{u.kebutuhan}</td>
                  <td className="py-1 px-1 text-center text-slate-300">{u.eksisting}</td>
                  <td className={`py-1 px-2 text-right ${selisihColor(u.selisih)}`}>
                    {formatSelisih(u.selisih)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. Per Kategori Section */}
      <div className="space-y-1.5">
        <div className="flex items-center space-x-1.5 text-slate-400 font-semibold text-[10px] uppercase tracking-wider">
          <Tag className="w-3.5 h-3.5" />
          <span>Rekapitulasi Per Kategori Jabatan</span>
        </div>
        <div className="border border-slate-800 rounded-lg overflow-hidden bg-slate-950/40">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-900 border-b border-slate-800 text-slate-400 text-[10px]">
                <th className="py-1.5 px-2 text-left font-medium">Kategori</th>
                <th className="py-1.5 px-1 text-center w-10 font-medium">Keb</th>
                <th className="py-1.5 px-1 text-center w-10 font-medium">Eks</th>
                <th className="py-1.5 px-2 text-right w-10 font-medium">Sel</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {perKategori.map(k => (
                <tr key={k.key} className="hover:bg-slate-900/40">
                  <td className="py-1 px-2 text-slate-300 truncate" title={k.label}>
                    {k.label}
                  </td>
                  <td className="py-1 px-1 text-center text-slate-300">{k.kebutuhan}</td>
                  <td className="py-1 px-1 text-center text-slate-300">{k.eksisting}</td>
                  <td className={`py-1 px-2 text-right ${selisihColor(k.selisih)}`}>
                    {formatSelisih(k.selisih)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Per Jenjang Section */}
      {perJenjang.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center space-x-1.5 text-slate-400 font-semibold text-[10px] uppercase tracking-wider">
            <Award className="w-3.5 h-3.5" />
            <span>Rekapitulasi Per Jenjang Fungsional</span>
          </div>
          <div className="border border-slate-800 rounded-lg overflow-hidden bg-slate-950/40">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-900 border-b border-slate-800 text-slate-400 text-[10px]">
                  <th className="py-1.5 px-2 text-left font-medium">Jenjang</th>
                  <th className="py-1.5 px-1 text-center w-10 font-medium">Keb</th>
                  <th className="py-1.5 px-1 text-center w-10 font-medium">Eks</th>
                  <th className="py-1.5 px-2 text-right w-10 font-medium">Sel</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {perJenjang.map(j => (
                  <tr key={j.key} className="hover:bg-slate-900/40">
                    <td className="py-1 px-2 text-slate-300 truncate" title={j.label}>
                      {j.label}
                    </td>
                    <td className="py-1 px-1 text-center text-slate-300">{j.kebutuhan}</td>
                    <td className="py-1 px-1 text-center text-slate-300">{j.eksisting}</td>
                    <td className={`py-1 px-2 text-right ${selisihColor(j.selisih)}`}>
                      {formatSelisih(j.selisih)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
