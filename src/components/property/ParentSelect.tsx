import React, { useState, useMemo } from 'react';
import { OrgNode } from '@/models/node';
import { useProjectStore } from '@/store/projectStore';
import { parentOf, allDepths } from '@/selectors/navigation';
import { validParentOptions } from '@/selectors/guards';
import { Search } from 'lucide-react';

interface ParentSelectProps {
  node: OrgNode;
}

export const ParentSelect: React.FC<ParentSelectProps> = ({ node }) => {
  const project = useProjectStore(s => s.project);
  const setParent = useProjectStore(s => s.setParent);
  const [searchTerm, setSearchTerm] = useState('');

  const nodes = project?.nodes ?? [];
  const edges = project?.edges ?? [];

  const currentParent = parentOf(nodes, edges, node.id);

  // Compute valid parent options. Fase 1.4: validParentOptions menghitung
  // descendantsOf(node.id) SEKALI (dulu: canSetParent per kandidat, masing-
  // masing memanggil descendantsOf sendiri — O(N²)), dan allDepths menghitung
  // depth semua node dalam satu BFS (dulu: depthOf per kandidat — O(N·depth)).
  const validParents = useMemo(() => {
    const depths = allDepths(nodes, edges);
    return validParentOptions(nodes, edges, node.id)
      .map(n => ({
        node: n,
        depth: depths.get(n.id) ?? 0,
        label: n.nama,
      }))
      .sort((a, b) => {
        // Unit nodes sort above position nodes
        if (a.node.type !== b.node.type) {
          return a.node.type === 'unit' ? -1 : 1;
        }
        return a.depth - b.depth;
      });
  }, [nodes, edges, node.id]);

  const filteredParents = useMemo(() => {
    if (!searchTerm.trim()) return validParents;
    const term = searchTerm.toLowerCase();
    return validParents.filter(p => p.node.nama.toLowerCase().includes(term));
  }, [validParents, searchTerm]);

  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
        Atasan (Parent Node)
      </label>

      {/* Search Input for long lists */}
      {validParents.length > 8 && (
        <div className="relative">
          <Search className="w-3 h-3 absolute left-2 top-2 text-slate-500" />
          <input
            type="text"
            placeholder="Cari atasan..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 text-slate-200 rounded pl-7 pr-2 py-1 text-xs outline-none focus:border-slate-700"
          />
        </div>
      )}

      <select
        value={currentParent?.id ?? ''}
        onChange={e => setParent(node.id, e.target.value || null)}
        className="w-full bg-slate-800 border border-slate-700 text-slate-100 rounded px-2.5 py-1.5 text-xs outline-none focus:border-blue-500 transition-colors font-mono"
      >
        <option value="">— Tidak ada atasan —</option>
        {filteredParents.map(p => (
          <option key={p.node.id} value={p.node.id}>
            {'  '.repeat(p.depth)}{p.node.type === 'unit' ? '📁 ' : '📄 '}
            {p.label}
          </option>
        ))}
      </select>
    </div>
  );
};
