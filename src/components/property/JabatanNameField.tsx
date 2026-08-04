import React, { useEffect, useMemo, useRef, useState } from 'react';
import { OrgNode } from '@/models/node';
import { useProjectStore } from '@/store/projectStore';
import { JabatanRefEntry, searchJabatanRef } from '@/config/jabatanRef';

interface JabatanNameFieldProps {
  node: OrgNode;
}

function badgeLabel(entry: JabatanRefEntry): string {
  if (entry.kategoriId === 'fungsional') {
    return entry.rumpun === 'keterampilan' ? 'JF · Keterampilan' : 'JF · Keahlian';
  }
  return `Pelaksana · ${entry.klasifikasiPelaksana}`;
}

export const JabatanNameField: React.FC<JabatanNameFieldProps> = ({ node }) => {
  const updateNode = useProjectStore(s => s.updateNode);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => searchJabatanRef(node.nama), [node.nama]);

  useEffect(() => {
    setHighlight(0);
  }, [matches.length, node.nama]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const pick = (entry: JabatanRefEntry) => {
    const patch: Partial<OrgNode> = { nama: entry.nama };
    // Isi kategori/rumpun otomatis hanya kalau belum diatur — jangan menimpa
    // klasifikasi yang sudah dikonfigurasi manual pada node ini.
    if (!node.kategoriId) {
      patch.kategoriId = entry.kategoriId;
    }
    if (
      entry.rumpun &&
      (!node.kategoriId || node.kategoriId === 'fungsional') &&
      !node.rumpun.includes(entry.rumpun)
    ) {
      patch.rumpun = [...node.rumpun, entry.rumpun];
    }
    updateNode(node.id, patch, `field:${node.id}:nama`);
    setOpen(false);
  };

  const exactMatch = matches.find(m => m.nama.toLowerCase() === node.nama.trim().toLowerCase());

  return (
    <div ref={containerRef} className="relative space-y-1">
      <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
        Nama Jabatan
      </label>
      <input
        type="text"
        value={node.nama}
        onChange={e => {
          updateNode(node.id, { nama: e.target.value }, `field:${node.id}:nama`);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={e => {
          if (!open || matches.length === 0) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlight(h => Math.min(h + 1, matches.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlight(h => Math.max(h - 1, 0));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            pick(matches[highlight]);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
        placeholder="Ketik nama jabatan..."
        autoComplete="off"
        className="w-full bg-slate-800 border border-slate-700 text-slate-100 rounded px-2.5 py-1.5 text-xs outline-none focus:border-blue-500 font-medium"
      />

      {exactMatch && !open && (
        <p className="text-[10px] text-emerald-500">Sesuai referensi — {badgeLabel(exactMatch)}</p>
      )}

      {open && matches.length > 0 && (
        <div className="absolute z-20 mt-0.5 w-full max-h-56 overflow-y-auto bg-slate-800 border border-slate-700 rounded shadow-lg">
          {matches.map((m, i) => (
            <button
              type="button"
              key={`${m.nama}|${m.kategoriId}|${m.rumpun ?? ''}|${m.klasifikasiPelaksana ?? ''}`}
              onMouseDown={e => e.preventDefault()}
              onClick={() => pick(m)}
              title={m.deskripsi}
              className={`w-full flex items-center justify-between space-x-2 px-2.5 py-1.5 text-left text-xs ${
                i === highlight ? 'bg-slate-700 text-slate-100' : 'text-slate-300 hover:bg-slate-700/60'
              }`}
            >
              <span className="truncate">{m.nama}</span>
              <span className="flex-shrink-0 text-[10px] text-slate-500">{badgeLabel(m)}</span>
            </button>
          ))}
        </div>
      )}

      {open && node.nama.trim() && matches.length === 0 && (
        <div className="absolute z-20 mt-0.5 w-full rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-[11px] text-slate-500 shadow-lg">
          Tidak ada di daftar referensi — nama custom tetap tersimpan.
        </div>
      )}
    </div>
  );
};
