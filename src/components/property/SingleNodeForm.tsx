import React from 'react';
import { OrgNode } from '@/models/node';
import { useProjectStore } from '@/store/projectStore';
import { ParentSelect } from './ParentSelect';
import { ClassificationEditor } from './ClassificationEditor';
import { KepalaUnitEditor } from './KepalaUnitEditor';
import { JenjangChips } from './JenjangChips';
import { RincianEditor } from './RincianEditor';
import { CustomAttributesEditor } from './CustomAttributesEditor';
import { RefreshCw } from 'lucide-react';

interface SingleNodeFormProps {
  node: OrgNode;
}

export const SingleNodeForm: React.FC<SingleNodeFormProps> = ({ node }) => {
  const updateNode = useProjectStore(s => s.updateNode);
  const setNodeType = useProjectStore(s => s.setNodeType);
  const renumberFromStructure = useProjectStore(s => s.renumberFromStructure);
  const attributeSchema = useProjectStore(s => s.project?.attributeSchema ?? []);

  return (
    <div className="space-y-4">
      {/* Identity Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
            Identitas Node
          </span>
          <span className="text-[10px] font-mono text-slate-500">ID: {node.id.slice(0, 8)}</span>
        </div>

        {/* Type Select */}
        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
            Tipe Node
          </label>
          <select
            value={node.type}
            onChange={e => setNodeType(node.id, e.target.value as 'unit' | 'jabatan')}
            className="w-full bg-slate-800 border border-slate-700 text-slate-100 rounded px-2.5 py-1.5 text-xs outline-none focus:border-blue-500"
          >
            <option value="unit">Unit Organisasi</option>
            <option value="jabatan">Jabatan</option>
          </select>
        </div>

        {/* Name */}
        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
            Nama {node.type === 'unit' ? 'Unit' : 'Jabatan'}
          </label>
          <input
            type="text"
            value={node.nama}
            onChange={e =>
              updateNode(node.id, { nama: e.target.value }, `field:${node.id}:nama`)
            }
            className="w-full bg-slate-800 border border-slate-700 text-slate-100 rounded px-2.5 py-1.5 text-xs outline-none focus:border-blue-500 font-medium"
          />
        </div>

        {/* Nomor & Renumber button */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              Nomor Hirarki
            </label>
            <button
              type="button"
              onClick={renumberFromStructure}
              className="flex items-center space-x-1 text-[10px] text-blue-400 hover:text-blue-300"
              title="Penomoran Ulang Otomatis dari Struktur"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Auto Nomor</span>
            </button>
          </div>
          <input
            type="text"
            placeholder="mis. 1.2.1"
            value={node.nomor}
            onChange={e =>
              updateNode(node.id, { nomor: e.target.value }, `field:${node.id}:nomor`)
            }
            className="w-full bg-slate-800 border border-slate-700 text-slate-100 rounded px-2.5 py-1.5 text-xs outline-none focus:border-blue-500 font-mono"
          />
        </div>

        {/* Position Code */}
        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
            Kode Jabatan
          </label>
          <input
            type="text"
            placeholder="mis. KOB.01"
            value={node.kode ?? ''}
            onChange={e =>
              updateNode(node.id, { kode: e.target.value }, `field:${node.id}:kode`)
            }
            className="w-full bg-slate-800 border border-slate-700 text-slate-100 rounded px-2.5 py-1.5 text-xs outline-none focus:border-blue-500 font-mono"
          />
        </div>
      </div>

      {/* Placement Section */}
      <div className="pt-2 border-t border-slate-800">
        <ParentSelect node={node} />
      </div>

      {/* Classification Section (Only for type === 'jabatan') */}
      {node.type === 'jabatan' && (
        <div className="pt-2 border-t border-slate-800">
          <ClassificationEditor node={node} />
        </div>
      )}

      {/* Kepala Unit Section (Only for type === 'unit') */}
      {node.type === 'unit' && (
        <div className="pt-2 border-t border-slate-800">
          <KepalaUnitEditor node={node} />
        </div>
      )}

      {/* Figures Section */}
      <div className="pt-2 border-t border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
            Angka Kebutuhan &amp; Eksisting
          </span>
        </div>

        {node.type === 'jabatan' && <JenjangChips node={node} />}
        <RincianEditor node={node} />
      </div>

      {/* Extras / Descriptive Section */}
      <div className="pt-2 border-t border-slate-800 space-y-2.5">
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
          Keterangan Tambahan
        </span>

        <div className="space-y-1">
          <label className="text-xs text-slate-400">Unit Kerja Specific</label>
          <input
            type="text"
            value={node.unitKerja ?? ''}
            onChange={e =>
              updateNode(node.id, { unitKerja: e.target.value }, `field:${node.id}:unitKerja`)
            }
            className="w-full bg-slate-800 border border-slate-700 text-slate-100 rounded px-2.5 py-1 text-xs outline-none focus:border-blue-500"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs text-slate-400">Catatan / Keterangan</label>
          <textarea
            rows={2}
            value={node.keterangan ?? ''}
            onChange={e =>
              updateNode(node.id, { keterangan: e.target.value }, `field:${node.id}:keterangan`)
            }
            className="w-full bg-slate-800 border border-slate-700 text-slate-100 rounded px-2.5 py-1 text-xs outline-none focus:border-blue-500 resize-none"
          />
        </div>
      </div>

      {/* Custom Attributes Section */}
      <CustomAttributesEditor node={node} attributes={attributeSchema} />
    </div>
  );
};
