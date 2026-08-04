import React from 'react';
import { OrgNode, Rincian } from '@/models/node';
import { jenjangLabel, getJenjangOptions } from '@/config/resolver';
import { useProjectStore } from '@/store/projectStore';
import { nodeTotals } from '@/selectors/totals';
import { NumberInput } from './NumberInput';

interface RincianEditorProps {
  node: OrgNode;
}

function sortRincian(node: OrgNode): Rincian[] {
  const options = getJenjangOptions(node.kategoriId, node.rumpun);
  const orderMap = new Map(options.map((j, i) => [j.id, i]));
  return [...node.rincian].sort(
    (a, b) => (orderMap.get(a.jenjangId ?? '') ?? 99) - (orderMap.get(b.jenjangId ?? '') ?? 99)
  );
}

export const RincianEditor: React.FC<RincianEditorProps> = ({ node }) => {
  const updateRincian = useProjectStore(s => s.updateRincian);

  const sortedRows = sortRincian(node);
  const totals = nodeTotals(node);
  const labeled = getJenjangOptions(node.kategoriId, node.rumpun).length > 0;

  if (node.type === 'unit') {
    return (
      <div className="p-3 bg-slate-950/40 border border-slate-800 rounded-lg text-xs text-slate-400 italic">
        Angka pada baris ini dihitung otomatis: kepala unit (bagian "Kepala Unit" di atas, bila diisi) ditambah seluruh jabatan pada node bawahan.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="border border-slate-800 rounded-lg overflow-hidden bg-slate-950/40">
        <table className="w-full text-xs font-mono border-collapse">
          <thead>
            <tr className="bg-slate-900 border-b border-slate-800 text-slate-400 text-[11px] text-left">
              <th className="py-1.5 px-2.5 font-medium">{labeled ? 'Jenjang' : 'Jabatan'}</th>
              <th className="py-1.5 px-1.5 font-medium text-center w-16">Keb</th>
              <th className="py-1.5 px-1.5 font-medium text-center w-16">Eks</th>
              <th className="py-1.5 px-2 font-medium text-right w-12">Sel</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {sortedRows.map(r => {
              const selisih = r.eksisting - r.kebutuhan;
              const selisihColor =
                selisih < 0
                  ? 'text-red-400 font-semibold'
                  : selisih > 0
                  ? 'text-amber-400 font-semibold'
                  : 'text-slate-400';

              return (
                <tr key={r.id} className="hover:bg-slate-900/50">
                  <td className="py-1 px-2.5 text-slate-300 truncate max-w-[110px]" title={labeled ? jenjangLabel(r.jenjangId, node.kategoriId) : '—'}>
                    {labeled ? jenjangLabel(r.jenjangId, node.kategoriId) : '—'}
                  </td>
                  <td className="py-1 px-1 text-center">
                    <NumberInput
                      value={r.kebutuhan}
                      onChange={v =>
                        updateRincian(node.id, r.id, { kebutuhan: v }, `num:${r.id}:keb`)
                      }
                    />
                  </td>
                  <td className="py-1 px-1 text-center">
                    <NumberInput
                      value={r.eksisting}
                      onChange={v =>
                        updateRincian(node.id, r.id, { eksisting: v }, `num:${r.id}:eks`)
                      }
                    />
                  </td>
                  <td className={`py-1 px-2 text-right ${selisihColor}`}>
                    {selisih > 0 ? `+${selisih}` : selisih}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-slate-900/80 border-t border-slate-700 font-bold text-slate-200">
              <td className="py-2 px-2.5">Total</td>
              <td className="py-2 px-1 text-center">{totals.kebutuhan}</td>
              <td className="py-2 px-1 text-center">{totals.eksisting}</td>
              <td
                className={`py-2 px-2 text-right ${
                  totals.selisih < 0
                    ? 'text-red-400'
                    : totals.selisih > 0
                    ? 'text-amber-400'
                    : 'text-slate-300'
                }`}
              >
                {totals.selisih > 0 ? `+${totals.selisih}` : totals.selisih}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};
