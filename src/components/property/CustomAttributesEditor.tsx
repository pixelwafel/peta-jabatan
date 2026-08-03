import React from 'react';
import { OrgNode } from '@/models/node';
import { CustomAttribute, CustomValue } from '@/models/project';
import { useProjectStore } from '@/store/projectStore';
import { NumberInput } from './NumberInput';

interface CustomAttributesEditorProps {
  node: OrgNode;
  attributes: CustomAttribute[];
}

export const CustomAttributesEditor: React.FC<CustomAttributesEditorProps> = ({
  node,
  attributes,
}) => {
  const updateNode = useProjectStore(s => s.updateNode);

  if (attributes.length === 0) return null;

  const handleChange = (attrId: string, val: CustomValue) => {
    const nextCustom = { ...node.custom, [attrId]: val };
    updateNode(node.id, { custom: nextCustom }, `field:${node.id}:${attrId}`);
  };

  return (
    <div className="space-y-3 pt-2 border-t border-slate-800">
      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
        Atribut Khusus
      </span>

      <div className="space-y-2.5">
        {attributes.map(attr => {
          const val = node.custom?.[attr.id] ?? null;

          return (
            <div key={attr.id} className="space-y-1">
              <label className="text-xs text-slate-300 flex items-center justify-between">
                <span>{attr.nama}</span>
                {attr.wajib && <span className="text-[10px] text-amber-400 font-mono">Wajib</span>}
              </label>

              {attr.tipe === 'text' && (
                <input
                  type="text"
                  value={(val as string) ?? ''}
                  onChange={e => handleChange(attr.id, e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-slate-100 rounded px-2.5 py-1 text-xs outline-none focus:border-blue-500"
                />
              )}

              {attr.tipe === 'number' && (
                <NumberInput
                  value={typeof val === 'number' ? val : 0}
                  onChange={n => handleChange(attr.id, n)}
                  min={0}
                />
              )}

              {attr.tipe === 'dropdown' && (
                <select
                  value={(val as string) ?? ''}
                  onChange={e => handleChange(attr.id, e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-slate-100 rounded px-2.5 py-1 text-xs outline-none focus:border-blue-500"
                >
                  <option value="">— Pilih —</option>
                  {(attr.opsi ?? []).map(opt => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              )}

              {attr.tipe === 'boolean' && (
                <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(val)}
                    onChange={e => handleChange(attr.id, e.target.checked)}
                    className="rounded bg-slate-800 border-slate-700 text-blue-600 focus:ring-0"
                  />
                  <span>Ya</span>
                </label>
              )}

              {attr.tipe === 'date' && (
                <input
                  type="date"
                  value={(val as string) ?? ''}
                  onChange={e => handleChange(attr.id, e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-slate-100 rounded px-2.5 py-1 text-xs outline-none focus:border-blue-500"
                />
              )}

              {attr.tipe === 'multiline' && (
                <textarea
                  rows={3}
                  value={(val as string) ?? ''}
                  onChange={e => handleChange(attr.id, e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-slate-100 rounded px-2.5 py-1 text-xs outline-none focus:border-blue-500 resize-none"
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
