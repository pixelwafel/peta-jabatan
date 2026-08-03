import React, { useMemo } from 'react';
import { useProjectStore } from '@/store/projectStore';
import { useUiStore } from '@/store/uiStore';
import { buildTree } from '@/selectors/tree';
import { TreeNode } from '@/models/derived';
import { OrgNode } from '@/models/node';
import { parentOf, ancestorsOf } from '@/selectors/navigation';
import { NODE_W, nodeHeight } from '@/utils/layout';
import { useReactFlow } from '@xyflow/react';
import { ChevronDown, ChevronRight, Folder, FileText } from 'lucide-react';

interface TreeRowProps {
  treeNode: TreeNode;
  nodeByIdMap: Map<string, OrgNode>;
  selectedIds: string[];
  onFocus: (id: string) => void;
  onToggleCollapse: (id: string) => void;
}

const TreeRow: React.FC<TreeRowProps> = ({
  treeNode,
  nodeByIdMap,
  selectedIds,
  onFocus,
  onToggleCollapse,
}) => {
  const node = nodeByIdMap.get(treeNode.id);
  if (!node) return null;

  const isSelected = selectedIds.includes(node.id);
  const isUnit = node.type === 'unit';
  const hasChildren = treeNode.children.length > 0;

  // Calculate figures summary
  const keb = node.rincian.reduce((acc, r) => acc + r.kebutuhan, 0);
  const eks = node.rincian.reduce((acc, r) => acc + r.eksisting, 0);

  return (
    <div className="space-y-0.5 select-none font-mono">
      <div
        onClick={() => onFocus(node.id)}
        className={`flex items-center justify-between py-1 px-1.5 rounded cursor-pointer transition-colors text-xs ${
          isSelected
            ? 'bg-blue-900/40 text-blue-200 font-semibold'
            : 'hover:bg-slate-800/60 text-slate-300'
        }`}
        style={{ paddingLeft: `${treeNode.depth * 12 + 6}px` }}
      >
        <div className="flex items-center space-x-1.5 min-w-0 pr-2">
          {hasChildren ? (
            <button
              onClick={e => {
                e.stopPropagation();
                onToggleCollapse(node.id);
              }}
              className="p-0.5 hover:bg-slate-700 rounded text-slate-400"
            >
              {node.collapsed ? (
                <ChevronRight className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
            </button>
          ) : (
            <span className="w-4 inline-block" />
          )}

          {isUnit ? (
            <Folder className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
          ) : (
            <FileText className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
          )}

          <span className="truncate">
            {node.nomor ? `${node.nomor} · ` : ''}
            {node.nama}
          </span>
        </div>

        {/* Figures Badge */}
        {!isUnit && node.rincian.length > 0 && (
          <span className="text-[10px] text-slate-400 bg-slate-950/60 px-1.5 py-0.5 rounded flex-shrink-0">
            {keb}/{eks}
          </span>
        )}
      </div>

      {/* Children render recursively if not collapsed */}
      {!node.collapsed &&
        treeNode.children.map(child => (
          <TreeRow
            key={child.id}
            treeNode={child}
            nodeByIdMap={nodeByIdMap}
            selectedIds={selectedIds}
            onFocus={onFocus}
            onToggleCollapse={onToggleCollapse}
          />
        ))}
    </div>
  );
};

export const TreeView: React.FC = () => {
  const project = useProjectStore(s => s.project);
  const updateNode = useProjectStore(s => s.updateNode);
  const selectedNodeIds = useUiStore(s => s.selectedNodeIds);
  const selectNodes = useUiStore(s => s.selectNodes);
  const showJenjangOnCard = useUiStore(s => s.showJenjangOnCard);
  const { setCenter } = useReactFlow();

  const nodes = project?.nodes ?? [];
  const edges = project?.edges ?? [];

  const tree = useMemo(() => buildTree(nodes, edges), [nodes, edges]);
  const nodeByIdMap = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);

  const handleFocus = (nodeId: string) => {
    // Auto expand collapsed ancestors
    const collapsedAncestors = ancestorsOf(nodes, edges, nodeId).filter(a => a.collapsed);
    if (collapsedAncestors.length > 0) {
      for (const a of collapsedAncestors) {
        updateNode(a.id, { collapsed: false });
      }
    }

    const target = nodeByIdMap.get(nodeId);
    if (target) {
      const h = nodeHeight(target, showJenjangOnCard);
      setCenter(target.position.x + NODE_W / 2, target.position.y + h / 2, {
        zoom: 1.2,
        duration: 300,
      });
      selectNodes([nodeId]);
    }
  };

  const handleToggleCollapse = (nodeId: string) => {
    const node = nodeByIdMap.get(nodeId);
    if (node) {
      updateNode(nodeId, { collapsed: !node.collapsed });
    }
  };

  if (nodes.length === 0) {
    return (
      <div className="p-4 text-center text-slate-500 italic text-xs">
        Tidak ada node dalam struktur.
      </div>
    );
  }

  return (
    <div className="space-y-1 py-1">
      {tree.map(treeNode => (
        <TreeRow
          key={treeNode.id}
          treeNode={treeNode}
          nodeByIdMap={nodeByIdMap}
          selectedIds={selectedNodeIds}
          onFocus={handleFocus}
          onToggleCollapse={handleToggleCollapse}
        />
      ))}
    </div>
  );
};
