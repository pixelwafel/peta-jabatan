import React from 'react';
import { useProjectStore } from '@/store/projectStore';
import { useUiStore } from '@/store/uiStore';
import { getStructureIndex } from '@/selectors/structureIndex';
import { designatedRoot, ancestorsOf } from '@/selectors/navigation';
import { ParentSelect } from '../property/ParentSelect';
import { NODE_W, nodeHeight, computeLayoutCached } from '@/utils/layout';
import { useReactFlow } from '@xyflow/react';
import { AlertCircle, FileText, Folder, CheckCircle2 } from 'lucide-react';

export const UnplacedPanel: React.FC = () => {
  const project = useProjectStore(s => s.project);
  const updateNode = useProjectStore(s => s.updateNode);
  const selectNodes = useUiStore(s => s.selectNodes);
  const showJenjangOnCard = useUiStore(s => s.showJenjangOnCard);
  const { setCenter } = useReactFlow();

  if (!project) return null;

  const idx = getStructureIndex(project.nodes, project.edges);
  const root = designatedRoot(project.nodes, project.edges);

  // Unplaced nodes: parentless nodes that are not the designated root
  const unplacedNodes = project.nodes.filter(
    n => !idx.parentId.has(n.id) && n.id !== root?.id
  );

  const handleFocusNode = (nodeId: string) => {
    const collapsedAncestors = ancestorsOf(project.nodes, project.edges, nodeId).filter(
      a => a.collapsed
    );
    if (collapsedAncestors.length > 0) {
      for (const a of collapsedAncestors) {
        updateNode(a.id, { collapsed: false });
      }
    }

    const target = project.nodes.find(n => n.id === nodeId);
    if (target) {
      // Fase 1.6: pakai posisi Dagre yang sama dengan yang benar-benar
      // dirender Canvas (bukan project.nodes[].position mentah — field itu
      // sebagian besar warisan lama, canvas mode preview selalu memakai
      // layout live). Dulu klik fokus di sini bisa center ke titik yang
      // beda dari posisi kartu yang sebenarnya tampil, KHUSUSNYA untuk node
      // unplaced yang posisi Dagre-nya (kolom di kanan) sengaja berbeda dari
      // position tersimpannya.
      const layout = computeLayoutCached(project.nodes, project.edges, {
        direction: 'TB',
        scope: 'all',
        showJenjang: showJenjangOnCard,
      });
      const pos = layout.get(nodeId) ?? target.position;
      const h = nodeHeight(target, showJenjangOnCard);
      setCenter(pos.x + NODE_W / 2, pos.y + h / 2, {
        zoom: 1.2,
        duration: 300,
      });
      selectNodes([nodeId]);
    }
  };

  return (
    <div className="space-y-3 text-xs select-none">
      <div className="flex items-center justify-between pb-1 border-b border-slate-800">
        <div className="flex items-center space-x-1.5 font-semibold text-slate-300">
          <AlertCircle className="w-4 h-4 text-amber-400" />
          <span>Belum Ditempatkan ({unplacedNodes.length})</span>
        </div>
      </div>

      {unplacedNodes.length === 0 ? (
        <div className="p-4 text-center text-slate-500 italic space-y-1">
          <CheckCircle2 className="w-5 h-5 text-emerald-500 mx-auto" />
          <p>Seluruh node telah ditempatkan pada hirarki!</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {unplacedNodes.map(node => (
            <div
              key={node.id}
              className="p-3 bg-slate-950/40 border border-slate-800 rounded-lg space-y-2 hover:border-slate-700 transition-colors"
            >
              <div
                onClick={() => handleFocusNode(node.id)}
                className="flex items-center justify-between cursor-pointer group"
              >
                <div className="flex items-center space-x-2 min-w-0 pr-2">
                  {node.type === 'unit' ? (
                    <Folder className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                  ) : (
                    <FileText className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                  )}
                  <span className="font-semibold text-slate-200 truncate group-hover:text-blue-300">
                    {node.nama}
                  </span>
                </div>
                <span className="text-[10px] font-mono bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded flex-shrink-0">
                  {node.type}
                </span>
              </div>

              {/* Inline Parent Selection Dropdown for fast reparenting */}
              <div className="pt-1">
                <ParentSelect node={node} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
