import React from 'react';
import { OrgNode } from '@/models/node';
import { useProjectStore } from '@/store/projectStore';
import { childrenOf } from '@/selectors/navigation';
import { ParentSelect } from './ParentSelect';
import { ClassificationEditor } from './ClassificationEditor';
import { KepalaUnitEditor } from './KepalaUnitEditor';
import { JabatanNameField } from './JabatanNameField';
import { JenjangChips } from './JenjangChips';
import { RincianEditor } from './RincianEditor';
import { CustomAttributesEditor } from './CustomAttributesEditor';
import { LinkEditor } from './LinkEditor';
import { RefreshCw, Lock, Unlock, Layers } from 'lucide-react';

interface SingleNodeFormProps {
  node: OrgNode;
  /** Status kunci node ini (individual — lihat selectors/guards.ts). */
  locked: boolean;
}

export const SingleNodeForm: React.FC<SingleNodeFormProps> = ({ node, locked }) => {
  const updateNode = useProjectStore(s => s.updateNode);
  const setNodeType = useProjectStore(s => s.setNodeType);
  const setLocked = useProjectStore(s => s.setLocked);
  const renumberFromStructure = useProjectStore(s => s.renumberFromStructure);
  const attributeSchema = useProjectStore(s => s.project?.attributeSchema ?? []);
  const hasChildren = useProjectStore(s => {
    if (!s.project) return false;
    return childrenOf(s.project.nodes, s.project.edges, node.id).length > 0;
  });

  const ownLocked = node.locked === true;

  return (
    <div className="space-y-4">
      {/* Lock banner */}
      <div
        className={`flex items-center justify-between px-2.5 py-2 rounded-lg border text-xs ${
          locked
            ? 'bg-amber-950/30 border-amber-900/60 text-amber-300'
            : 'bg-slate-950/40 border-slate-800 text-slate-400'
        }`}
      >
        <span className="flex items-center space-x-1.5">
          {locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
          <span>{locked ? 'Node ini terkunci.' : 'Node ini tidak terkunci.'}</span>
        </span>
        <div className="flex items-center space-x-1.5">
          {hasChildren && (
            <button
              type="button"
              onClick={() => setLocked(node.id, !ownLocked, { cascade: true })}
              title={
                ownLocked
                  ? 'Buka kunci node ini beserta seluruh turunannya'
                  : 'Kunci node ini beserta seluruh turunannya'
              }
              className="flex items-center space-x-1 px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded font-medium"
            >
              <Layers className="w-3 h-3" />
              <span>{ownLocked ? 'Buka + Turunan' : 'Kunci + Turunan'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setLocked(node.id, !ownLocked)}
            className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded font-medium"
          >
            {ownLocked ? 'Buka Kunci' : 'Kunci Node'}
          </button>
        </div>
      </div>

      <fieldset disabled={locked} className="space-y-4">
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

        {/* Kategori dulu — nama jabatan pada daftar referensi dikelompokkan
            per kategori, jadi lebih runut dipilih dulu sebelum mengetik nama. */}
        {node.type === 'jabatan' && <ClassificationEditor node={node} />}

        {/* Name */}
        {node.type === 'jabatan' ? (
          <JabatanNameField node={node} />
        ) : (
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              Nama Unit
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
        )}
      </div>

      {/* Struktur & Penempatan */}
      <div className="pt-2 border-t border-slate-800 space-y-3">
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
          Struktur &amp; Penempatan
        </span>
        <ParentSelect node={node} />

        {/* Link node (docs/13-link-nodes.md) menggantikan Kepala Unit — link &
            kepalaUnit saling eksklusif. "Jadikan tautan…" cuma tampil untuk
            unit kosong tanpa children (ditegakkan juga di store/projectStore.ts
            makeLink). */}
        {node.type === 'unit' && <LinkEditor node={node} hasChildren={hasChildren} />}

        {/* Kepala Unit Section (unit biasa, bukan link) */}
        {node.type === 'unit' && !node.link && <KepalaUnitEditor node={node} />}
      </div>

      {/* Figures Section — disembunyikan untuk link node: angkanya berasal
          dari resolusi tautan (panel TAUTAN di atas), bukan rincian lokal. */}
      {!node.link && (
        <div className="pt-2 border-t border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              Angka Kebutuhan &amp; Eksisting
            </span>
          </div>

          {node.type === 'jabatan' && <JenjangChips node={node} />}
          <RincianEditor node={node} />
        </div>
      )}

      {/* Detail Tambahan (Opsional) — nomor & kode tidak wajib diisi manual:
          nomor bisa digenerate lewat "Auto Nomor" (kosong cuma info, tidak
          menghalangi Cek Kesiapan), kode jabatan tidak divalidasi sama sekali
          kecuali dicek duplikat kalau diisi. */}
      <div className="pt-2 border-t border-slate-800 space-y-2.5">
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
          Detail Tambahan (Opsional)
        </span>

        {/* Nomor & Renumber button */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-xs text-slate-400">Nomor Hirarki</label>
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
            className="w-full bg-slate-800 border border-slate-700 text-slate-100 rounded px-2.5 py-1 text-xs outline-none focus:border-blue-500 font-mono"
          />
        </div>

        {/* Position Code */}
        <div className="space-y-1">
          <label className="text-xs text-slate-400">Kode Jabatan</label>
          <input
            type="text"
            placeholder="mis. KOB.01"
            value={node.kode ?? ''}
            onChange={e =>
              updateNode(node.id, { kode: e.target.value }, `field:${node.id}:kode`)
            }
            className="w-full bg-slate-800 border border-slate-700 text-slate-100 rounded px-2.5 py-1 text-xs outline-none focus:border-blue-500 font-mono"
          />
        </div>
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
      </fieldset>
    </div>
  );
};
