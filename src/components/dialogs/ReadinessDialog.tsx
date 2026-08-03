import React, { useState } from 'react';
import { useProjectStore } from '@/store/projectStore';
import { validateProject, buildReadinessReport } from '@/selectors/validation';
import { useUiStore } from '@/store/uiStore';
import { ancestorsOf } from '@/selectors/navigation';
import { NODE_W, nodeHeight } from '@/utils/layout';
import { useReactFlow } from '@xyflow/react';
import {
  ShieldCheck,
  ShieldAlert,
  AlertCircle,
  AlertTriangle,
  Info,
  ChevronDown,
  ChevronRight,
  Download,
  X,
} from 'lucide-react';

interface ReadinessDialogProps {
  onClose: () => void;
  onOpenExport: () => void;
}

export const ReadinessDialog: React.FC<ReadinessDialogProps> = ({
  onClose,
  onOpenExport,
}) => {
  const project = useProjectStore(s => s.project);
  const updateNode = useProjectStore(s => s.updateNode);
  const selectNodes = useUiStore(s => s.selectNodes);
  const showJenjangOnCard = useUiStore(s => s.showJenjangOnCard);
  const { setCenter } = useReactFlow();

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  if (!project) return null;

  const findings = validateProject(project);
  const report = buildReadinessReport(findings);

  const toggleGroup = (code: string) => {
    setExpandedGroups(prev => ({ ...prev, [code]: !prev[code] }));
  };

  const handleFocusNode = (nodeId?: string) => {
    if (!nodeId) return;

    // Expand collapsed ancestors
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
      const h = nodeHeight(target, showJenjangOnCard);
      setCenter(target.position.x + NODE_W / 2, target.position.y + h / 2, {
        zoom: 1.2,
        duration: 300,
      });
      selectNodes([nodeId]);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-w-xl w-full flex flex-col max-h-[85vh] text-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950/40">
          <div className="flex items-center space-x-2 font-semibold text-sm text-slate-100">
            {report.ready ? (
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
            ) : (
              <ShieldAlert className="w-5 h-5 text-rose-400" />
            )}
            <span>Pemeriksaan Kesiapan Data</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Status Summary Banner */}
        <div className="p-4 border-b border-slate-800/80 bg-slate-950/20 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span
                className={`px-2.5 py-1 rounded text-xs font-bold ${
                  report.ready
                    ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/60'
                    : 'bg-rose-950/60 text-rose-300 border border-rose-800/60'
                }`}
              >
                {report.ready ? '✓ SIAP DIEKSPOR' : '⚠️ BELUM SIAP (ADA KESALAHAN)'}
              </span>
            </div>

            <div className="flex items-center space-x-3 text-xs font-mono">
              <span className="flex items-center space-x-1 text-rose-400">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>{report.summary.errors} kesalahan</span>
              </span>
              <span className="flex items-center space-x-1 text-amber-400">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>{report.summary.warnings} peringatan</span>
              </span>
              <span className="flex items-center space-x-1 text-blue-400">
                <Info className="w-3.5 h-3.5" />
                <span>{report.summary.infos} info</span>
              </span>
            </div>
          </div>
        </div>

        {/* Grouped Findings List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 text-xs">
          {report.groups.length === 0 ? (
            <div className="py-8 text-center text-slate-500 italic">
              Tidak ada temuan. Data struktur 100% valid dan siap diekspor!
            </div>
          ) : (
            report.groups.map(group => {
              const isExpanded = expandedGroups[group.code] ?? true;

              return (
                <div
                  key={group.code}
                  className="border border-slate-800 rounded-lg overflow-hidden bg-slate-950/40"
                >
                  <button
                    onClick={() => toggleGroup(group.code)}
                    className="w-full flex items-center justify-between p-2.5 bg-slate-900/60 hover:bg-slate-800/60 transition-colors text-left"
                  >
                    <div className="flex items-center space-x-2">
                      {group.severity === 'error' && (
                        <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                      )}
                      {group.severity === 'warning' && (
                        <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                      )}
                      {group.severity === 'info' && (
                        <Info className="w-4 h-4 text-blue-400 flex-shrink-0" />
                      )}

                      <span className="font-semibold text-slate-200">
                        {group.title}
                      </span>
                    </div>

                    <div className="flex items-center space-x-2">
                      <span className="text-[10px] font-mono bg-slate-800 text-slate-400 px-2 py-0.5 rounded">
                        {group.count}
                      </span>
                      {isExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                      )}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="divide-y divide-slate-800/60 border-t border-slate-800/60">
                      {group.items.map((item, idx) => (
                        <div
                          key={idx}
                          onClick={() => handleFocusNode(item.nodeId)}
                          className={`p-2 pl-8 flex items-center justify-between hover:bg-slate-800/40 transition-colors ${
                            item.nodeId ? 'cursor-pointer' : ''
                          }`}
                        >
                          <span className="text-slate-300 font-mono text-[11px]">
                            {item.message}
                          </span>
                          {item.nodeId && (
                            <span className="text-[10px] text-blue-400 hover:text-blue-300 font-sans">
                              Fokus Node →
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end space-x-2 px-4 py-3 border-t border-slate-800 bg-slate-950/60">
          <button
            onClick={onClose}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs"
          >
            Perbaiki Dulu
          </button>
          <button
            onClick={() => {
              onClose();
              onOpenExport();
            }}
            className="flex items-center space-x-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-medium shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Ekspor Tetap</span>
          </button>
        </div>
      </div>
    </div>
  );
};
