import React from 'react';
import { useProjectStore } from '@/store/projectStore';
import { Building2 } from 'lucide-react';

export const ProjectMetaForm: React.FC = () => {
  const project = useProjectStore(s => s.project);
  const setMeta = useProjectStore(s => s.setMeta);

  if (!project) return null;

  const meta = project.meta;

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-2 text-slate-200 font-semibold text-xs pb-2 border-b border-slate-800">
        <Building2 className="w-4 h-4 text-blue-400" />
        <span>Metadata Proyek &amp; OPD</span>
      </div>

      <div className="space-y-3 text-xs">
        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
            Nama OPD / Instansi <span className="text-amber-400">*</span>
          </label>
          <input
            type="text"
            placeholder="mis. Dinas Kesehatan"
            value={meta.namaOPD ?? ''}
            onChange={e => setMeta({ namaOPD: e.target.value })}
            className="w-full bg-slate-800 border border-slate-700 text-slate-100 rounded px-2.5 py-1.5 text-xs outline-none focus:border-blue-500"
          />
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
            Kode OPD <span className="text-amber-400">*</span>
          </label>
          <input
            type="text"
            placeholder="mis. DINKES.01"
            value={meta.kodeOPD ?? ''}
            onChange={e => setMeta({ kodeOPD: e.target.value })}
            className="w-full bg-slate-800 border border-slate-700 text-slate-100 rounded px-2.5 py-1.5 text-xs outline-none focus:border-blue-500 font-mono"
          />
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
            Penyusun
          </label>
          <input
            type="text"
            placeholder="Nama penyusun / Jabatan"
            value={meta.penyusun ?? ''}
            onChange={e => setMeta({ penyusun: e.target.value })}
            className="w-full bg-slate-800 border border-slate-700 text-slate-100 rounded px-2.5 py-1.5 text-xs outline-none focus:border-blue-500"
          />
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
            Tahun Anggaran
          </label>
          <input
            type="text"
            placeholder="2027"
            value={meta.tahunAnggaran ?? ''}
            onChange={e => setMeta({ tahunAnggaran: e.target.value })}
            className="w-full bg-slate-800 border border-slate-700 text-slate-100 rounded px-2.5 py-1.5 text-xs outline-none focus:border-blue-500 font-mono"
          />
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
            Keterangan
          </label>
          <textarea
            rows={3}
            placeholder="Catatan proyek..."
            value={meta.keterangan ?? ''}
            onChange={e => setMeta({ keterangan: e.target.value })}
            className="w-full bg-slate-800 border border-slate-700 text-slate-100 rounded px-2.5 py-1.5 text-xs outline-none focus:border-blue-500 resize-none"
          />
        </div>
      </div>
    </div>
  );
};
