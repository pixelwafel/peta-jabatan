import React, { useMemo, useRef, useState } from 'react';
import { useProjectStore } from '@/store/projectStore';
import { useUiStore } from '@/store/uiStore';
import { buildColumnGroups, TemplateColumnGroup } from '@/selectors/templateInstance';
import { UnitInstance } from '@/models/project';
import { computeVisibleRange } from '@/utils/virtualization';
import { Plus, Trash2, Copy, LayoutGrid } from 'lucide-react';
import { NumberInput } from '../property/NumberInput';

type ColumnGroup = TemplateColumnGroup;

const ROW_HEIGHT = 32;
const OVERSCAN = 6;
const VIEWPORT_HEIGHT = 420;

/**
 * Grid instance virtualized (docs/15-template-instance.md §2, §6): satu baris
 * per satuan, kolom dikelompokkan per posisi/kepala unit, sub-kolom K/E (atau
 * level·K/level·E kalau posisinya punya >1 baris rincian). Virtualisasi
 * manual (window kecil + spacer) — target 1.000 baris tanpa render semuanya
 * ke DOM sekaligus (doc §6 "virtualization targets 1,000 rows").
 *
 * Ini pengganti tabel compact di property/TemplateEditor.tsx untuk skala
 * besar — dipasang di center pane (tab "Satuan", shell/StructurePanel.tsx)
 * yang punya ruang penuh, bukan di sidebar sempit.
 */
export const InstanceGrid: React.FC<{ templateNodeId: string }> = ({ templateNodeId }) => {
  const project = useProjectStore(s => s.project);
  const addInstance = useProjectStore(s => s.addInstance);
  const duplicateInstance = useProjectStore(s => s.duplicateInstance);
  const removeInstance = useProjectStore(s => s.removeInstance);
  const updateInstanceFigure = useProjectStore(s => s.updateInstanceFigure);
  const openConfirm = useUiStore(s => s.openConfirm);

  const [scrollTop, setScrollTop] = useState(0);
  const [newName, setNewName] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const templateNode = project?.nodes.find(n => n.id === templateNodeId);
  const nodes = project?.nodes ?? [];
  const edges = project?.edges ?? [];

  const groups: ColumnGroup[] = useMemo(() => {
    if (!templateNode) return [];
    return buildColumnGroups(templateNodeId, nodes, edges);
  }, [templateNode, nodes, edges, templateNodeId]);

  const instances = useMemo(
    () => (project?.instances ?? []).filter(i => i.templateNodeId === templateNodeId),
    [project?.instances, templateNodeId]
  );

  const { startIndex, endIndex } = computeVisibleRange(scrollTop, ROW_HEIGHT, VIEWPORT_HEIGHT, OVERSCAN, instances.length);
  const visibleInstances = instances.slice(startIndex, endIndex);

  if (!templateNode) return null;

  const figureOf = (inst: UnitInstance, key: string) => inst.figures[key] ?? { kebutuhan: 0, eksisting: 0 };

  const rowTotal = (inst: UnitInstance) => {
    let keb = 0, eks = 0;
    for (const g of groups) {
      for (const c of g.columns) {
        const f = figureOf(inst, c.key);
        keb += f.kebutuhan;
        eks += f.eksisting;
      }
    }
    return { keb, eks };
  };

  const handleRemove = (inst: UnitInstance) => {
    const t = rowTotal(inst);
    openConfirm({
      title: `Hapus satuan "${inst.nama}"?`,
      body: `Total kebutuhan ${t.keb} · eksisting ${t.eks} pada satuan ini akan hilang.`,
      confirmLabel: 'Hapus',
      danger: true,
      onConfirm: () => removeInstance(inst.id),
    });
  };

  return (
    <div className="h-full flex flex-col text-slate-300 text-xs">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800 bg-slate-950/40 flex-shrink-0">
        <div className="flex items-center space-x-2">
          <LayoutGrid className="w-4 h-4 text-teal-400" />
          <span className="font-semibold text-slate-100">{templateNode.nama}</span>
          <span className="text-slate-500">— {instances.length} satuan</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <input
            type="text"
            placeholder="Nama satuan baru…"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-slate-100 rounded px-2 py-1 text-xs outline-none focus:border-blue-500 w-56"
          />
          <button
            onClick={() => {
              if (!newName.trim()) return;
              addInstance(templateNodeId, newName.trim());
              setNewName('');
            }}
            disabled={!newName.trim()}
            className="flex items-center space-x-1 px-2.5 py-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded font-medium"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Tambah Satuan</span>
          </button>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-slate-500 italic p-6 text-center">
          Belum ada posisi/kepala unit di bawah "{templateNode.nama}" — tambah dulu di outline supaya ada kolom untuk diisi per satuan.
        </div>
      ) : (
        <div
          ref={scrollRef}
          onScroll={e => setScrollTop(e.currentTarget.scrollTop)}
          className="flex-1 overflow-auto"
          style={{ maxHeight: VIEWPORT_HEIGHT }}
        >
          <table className="border-collapse font-mono text-[11px]" style={{ width: '100%' }}>
            <thead className="sticky top-0 z-10 bg-slate-950">
              <tr>
                <th rowSpan={2} className="sticky left-0 z-20 bg-slate-950 border-b border-r border-slate-800 px-2 py-1 text-left align-bottom min-w-[160px]">
                  Satuan
                </th>
                {groups.map(g => (
                  <th
                    key={g.nodeId}
                    colSpan={g.columns.length * 2}
                    className="border-b border-l border-slate-800 px-1.5 py-1 text-center text-slate-300 whitespace-nowrap"
                    title={g.label}
                  >
                    {g.label}
                  </th>
                ))}
              </tr>
              <tr>
                {groups.map(g =>
                  g.columns.map((c, i) => (
                    <React.Fragment key={c.key}>
                      <th
                        className={`border-b ${i === 0 ? 'border-l' : ''} border-slate-800 px-1 py-0.5 text-center text-slate-500 font-normal w-10`}
                        title={c.label ? `${c.label} · Kebutuhan` : 'Kebutuhan'}
                      >
                        {c.label ? `${c.label}·K` : 'K'}
                      </th>
                      <th
                        className="border-b border-slate-800 px-1 py-0.5 text-center text-slate-500 font-normal w-10"
                        title={c.label ? `${c.label} · Eksisting` : 'Eksisting'}
                      >
                        {c.label ? `${c.label}·E` : 'E'}
                      </th>
                    </React.Fragment>
                  ))
                )}
              </tr>
            </thead>
            <tbody style={{ position: 'relative' }}>
              {/* Spacer atas: dorong baris pertama yang dirender ke posisi Y sebenarnya */}
              {startIndex > 0 && (
                <tr style={{ height: startIndex * ROW_HEIGHT }} aria-hidden>
                  <td colSpan={1 + groups.reduce((n, g) => n + g.columns.length * 2, 0)} />
                </tr>
              )}

              {visibleInstances.map(inst => (
                <tr key={inst.id} style={{ height: ROW_HEIGHT }} className="hover:bg-slate-900/50 group">
                  <td className="sticky left-0 z-10 bg-slate-950 border-r border-slate-800 px-2 truncate max-w-[160px]" title={inst.nama}>
                    <div className="flex items-center justify-between space-x-1">
                      <span className="truncate">{inst.nama}</span>
                      <div className="hidden group-hover:flex items-center space-x-1 flex-shrink-0">
                        <button onClick={() => duplicateInstance(inst.id)} title="Duplikat" className="text-slate-500 hover:text-blue-400">
                          <Copy className="w-3 h-3" />
                        </button>
                        <button onClick={() => handleRemove(inst)} title="Hapus" className="text-slate-500 hover:text-rose-400">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </td>
                  {groups.map(g =>
                    g.columns.map((c, i) => {
                      const fig = figureOf(inst, c.key);
                      return (
                        <React.Fragment key={c.key}>
                          <td className={i === 0 ? 'border-l border-slate-800/60 p-0' : 'p-0'}>
                            <NumberInput
                              value={fig.kebutuhan}
                              onChange={v =>
                                updateInstanceFigure(
                                  inst.id,
                                  c.key,
                                  { kebutuhan: v },
                                  `inst:${inst.id}:${c.key}:keb`
                                )
                              }
                              className="!bg-transparent !border-transparent focus:!bg-slate-800 !rounded-none"
                            />
                          </td>
                          <td className="p-0">
                            <NumberInput
                              value={fig.eksisting}
                              onChange={v =>
                                updateInstanceFigure(
                                  inst.id,
                                  c.key,
                                  { eksisting: v },
                                  `inst:${inst.id}:${c.key}:eks`
                                )
                              }
                              className="!bg-transparent !border-transparent focus:!bg-slate-800 !rounded-none"
                            />
                          </td>
                        </React.Fragment>
                      );
                    })
                  )}
                </tr>
              ))}

              {/* Spacer bawah: sisa tinggi supaya scrollbar tetap merepresentasikan total baris */}
              {endIndex < instances.length && (
                <tr style={{ height: (instances.length - endIndex) * ROW_HEIGHT }} aria-hidden>
                  <td colSpan={1 + groups.reduce((n, g) => n + g.columns.length * 2, 0)} />
                </tr>
              )}

              {instances.length === 0 && (
                <tr>
                  <td
                    colSpan={1 + groups.reduce((n, g) => n + g.columns.length * 2, 0)}
                    className="text-center text-slate-500 italic py-6"
                  >
                    Belum ada satuan — tambah lewat kotak di kanan atas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
