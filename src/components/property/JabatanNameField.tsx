import React, { useEffect, useMemo, useState } from 'react';
import { OrgNode } from '@/models/node';
import { useProjectStore } from '@/store/projectStore';
import { JabatanRefEntry, searchJabatanRef } from '@/config/jabatanRef';
import { Plus } from 'lucide-react';

interface JabatanNameFieldProps {
  node: OrgNode;
}

function badgeLabel(entry: JabatanRefEntry): string {
  if (entry.kategoriId === 'fungsional') {
    return entry.rumpun === 'keterampilan' ? 'JF · Keterampilan' : 'JF · Keahlian';
  }
  return `Pelaksana · ${entry.klasifikasiPelaksana}`;
}

/**
 * Nama jabatan tidak langsung tersimpan per keystroke seperti field lain —
 * operator harus mengonfirmasi lewat memilih saran referensi ATAU tombol
 * eksplisit "Tambah ... sebagai jabatan baru". Mengetik lalu klik keluar
 * tanpa konfirmasi membuang perubahan (draft kembali ke node.nama), supaya
 * nama jabatan tidak pernah tersimpan cuma karena ketikan tak sengaja.
 */
export const JabatanNameField: React.FC<JabatanNameFieldProps> = ({ node }) => {
  const updateNode = useProjectStore(s => s.updateNode);
  const [draft, setDraft] = useState(node.nama);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  // Ganti node terpilih -> draft mulai dari nama tersimpan node baru.
  useEffect(() => {
    setDraft(node.nama);
    setOpen(false);
  }, [node.id]);

  useEffect(() => {
    setHighlight(0);
  }, [draft]);

  const matches = useMemo(() => searchJabatanRef(draft), [draft]);
  const trimmed = draft.trim();
  const exactMatch = matches.find(m => m.nama.toLowerCase() === trimmed.toLowerCase());
  const showAddCustom = trimmed !== '' && !exactMatch;
  // Index 0..matches.length-1 = saran; index terakhir (kalau ada) = tombol "tambah custom".
  const rowCount = matches.length + (showAddCustom ? 1 : 0);

  const commit = (nama: string, extra?: Partial<OrgNode>) => {
    updateNode(node.id, { nama, ...extra }, `field:${node.id}:nama`);
    setDraft(nama);
    setOpen(false);
  };

  const pickSuggestion = (entry: JabatanRefEntry) => {
    const patch: Partial<OrgNode> = {};
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
    commit(entry.nama, patch);
  };

  const addCustom = () => {
    if (!trimmed) return;
    commit(trimmed);
  };

  return (
    <div className="relative space-y-1">
      <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
        Nama Jabatan
      </label>
      <input
        type="text"
        value={draft}
        onChange={e => {
          setDraft(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // Belum dikonfirmasi (belum klik saran / tombol tambah) -> dibuang.
          setOpen(false);
          setDraft(node.nama);
        }}
        onKeyDown={e => {
          if (!open || rowCount === 0) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlight(h => Math.min(h + 1, rowCount - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlight(h => Math.max(h - 1, 0));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            if (highlight < matches.length) {
              pickSuggestion(matches[highlight]);
            } else if (showAddCustom) {
              addCustom();
            }
          } else if (e.key === 'Escape') {
            setOpen(false);
            setDraft(node.nama);
          }
        }}
        placeholder="Ketik nama jabatan..."
        autoComplete="off"
        className="w-full bg-slate-800 border border-slate-700 text-slate-100 rounded px-2.5 py-1.5 text-xs outline-none focus:border-blue-500 font-medium"
      />

      {!open && exactMatch && (
        <p className="text-[10px] text-emerald-500">Sesuai referensi — {badgeLabel(exactMatch)}</p>
      )}
      {!open && !exactMatch && trimmed && (
        <p className="text-[10px] text-slate-500">Nama custom (di luar daftar referensi).</p>
      )}

      {open && (matches.length > 0 || showAddCustom) && (
        <div className="absolute z-20 mt-0.5 w-full max-h-64 overflow-y-auto bg-slate-800 border border-slate-700 rounded shadow-lg">
          {matches.map((m, i) => (
            <button
              type="button"
              key={`${m.nama}|${m.kategoriId}|${m.rumpun ?? ''}|${m.klasifikasiPelaksana ?? ''}`}
              onMouseDown={e => e.preventDefault()}
              onClick={() => pickSuggestion(m)}
              title={m.deskripsi}
              className={`w-full flex items-center justify-between space-x-2 px-2.5 py-1.5 text-left text-xs ${
                i === highlight ? 'bg-slate-700 text-slate-100' : 'text-slate-300 hover:bg-slate-700/60'
              }`}
            >
              <span className="truncate">{m.nama}</span>
              <span className="flex-shrink-0 text-[10px] text-slate-500">{badgeLabel(m)}</span>
            </button>
          ))}

          {showAddCustom && (
            <button
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={addCustom}
              className={`w-full flex items-center space-x-1.5 px-2.5 py-1.5 text-left text-xs border-t border-slate-700 ${
                highlight === matches.length
                  ? 'bg-slate-700 text-blue-300'
                  : 'text-blue-400 hover:bg-slate-700/60'
              }`}
            >
              <Plus className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">Tambah &quot;{trimmed}&quot; sebagai jabatan baru</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
