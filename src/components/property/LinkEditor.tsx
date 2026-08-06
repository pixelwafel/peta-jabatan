import React, { useMemo, useState } from 'react';
import { OrgNode } from '@/models/node';
import { useProjectStore } from '@/store/projectStore';
import { useProjectIndexStore } from '@/store/projectIndexStore';
import { useUiStore } from '@/store/uiStore';
import { resolveLink } from '@/selectors/linkResolver';
import { getProject } from '@/persistence/storage';
import { ProjectIndex } from '@/persistence/types';
import { Link2, ExternalLink, Unlink } from 'lucide-react';

const EMPTY_INDEX: ProjectIndex = { version: 1, activeId: null, entries: [] };

interface LinkEditorProps {
  node: OrgNode;
  /** "Jadikan tautan…" cuma boleh muncul kalau unit belum punya children (doc 13 §1). */
  hasChildren: boolean;
}

const statusLabel: Record<'live' | 'cached' | 'unresolved', string> = {
  live: 'Live',
  cached: 'Cache',
  unresolved: 'Belum terhubung',
};

const statusDotColor: Record<'live' | 'cached' | 'unresolved', string> = {
  live: 'bg-emerald-400',
  cached: 'bg-amber-400',
  unresolved: 'bg-rose-400',
};

/**
 * Panel TAUTAN (docs/13-link-nodes.md §5). Menggantikan seksi Kepala Unit/
 * Rincian kalau node ini sudah jadi link; kalau belum & unit tanpa children,
 * menampilkan aksi "Jadikan tautan…" yang membuka form pemilihan project.
 */
export const LinkEditor: React.FC<LinkEditorProps> = ({ node, hasChildren }) => {
  const index = useProjectIndexStore(s => s.index);
  const makeLink = useProjectStore(s => s.makeLink);
  const unlinkNode = useProjectStore(s => s.unlinkNode);
  const setProject = useProjectStore(s => s.setProject);
  const openConfirm = useUiStore(s => s.openConfirm);

  const [picking, setPicking] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [freeKode, setFreeKode] = useState('');
  const [freeNama, setFreeNama] = useState('');
  const [error, setError] = useState<string | null>(null);

  const resolved = useMemo(() => {
    if (!node.link) return null;
    return resolveLink(node.link, index ?? EMPTY_INDEX);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.link, index]);

  if (node.link && resolved) {
    const formattedDate = resolved.status === 'live' ? 'hari ini' : resolved.asOf
      ? new Date(resolved.asOf).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
      : '—';

    const handleOpen = async () => {
      if (!resolved.targetProjectId) return;
      const target = await getProject(resolved.targetProjectId);
      if (target) setProject(target);
    };

    const handleUnlink = () => {
      openConfirm({
        title: 'Putuskan tautan?',
        body: `"${node.nama}" akan kembali jadi unit kosong biasa. Angka cache (Keb ${resolved.totals.kebutuhan} · Eks ${resolved.totals.eksisting}) akan hilang dari rekap sampai node ini diisi atau ditautkan ulang.`,
        confirmLabel: 'Putuskan',
        danger: true,
        onConfirm: () => unlinkNode(node.id),
      });
    };

    return (
      <div className="space-y-2 rounded-lg border border-indigo-900/50 bg-indigo-950/20 p-2.5">
        <div className="flex items-center space-x-1.5 pb-1 border-b border-indigo-900/40">
          <Link2 className="w-3.5 h-3.5 text-indigo-400" />
          <span className="text-[10px] font-semibold text-indigo-300 uppercase tracking-wider">Tautan</span>
        </div>

        <dl className="text-xs space-y-1.5">
          <div className="flex items-center justify-between">
            <dt className="text-slate-500">Kode</dt>
            <dd className="font-mono text-slate-200">{node.link.kodeOPD}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-slate-500">Project</dt>
            <dd className="text-slate-200 truncate max-w-[65%]" title={node.link.namaProject}>
              {node.link.namaProject}
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-slate-500">Status</dt>
            <dd className="flex items-center space-x-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${statusDotColor[resolved.status]}`} />
              <span className="text-slate-200">{statusLabel[resolved.status]}</span>
            </dd>
          </div>
          {resolved.status !== 'unresolved' && (
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">Angka</dt>
              <dd className="font-mono text-slate-200">
                Keb {resolved.totals.kebutuhan} · Eks {resolved.totals.eksisting}
              </dd>
            </div>
          )}
          <div className="flex items-center justify-between">
            <dt className="text-slate-500">Per</dt>
            <dd className="text-slate-200">{formattedDate}</dd>
          </div>
        </dl>

        <div className="flex items-center space-x-1.5 pt-1">
          <button
            type="button"
            disabled={resolved.status !== 'live'}
            onClick={handleOpen}
            className="flex-1 flex items-center justify-center space-x-1 px-2 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 rounded text-[11px] font-medium"
          >
            <ExternalLink className="w-3 h-3" />
            <span>Buka project</span>
          </button>
          <button
            type="button"
            onClick={handleUnlink}
            className="flex-1 flex items-center justify-center space-x-1 px-2 py-1.5 bg-rose-950/40 hover:bg-rose-900/50 text-rose-300 rounded text-[11px] font-medium border border-rose-900/50"
          >
            <Unlink className="w-3 h-3" />
            <span>Putuskan</span>
          </button>
        </div>
      </div>
    );
  }

  if (hasChildren) return null; // link & children saling eksklusif, doc 13 §1
  if (node.isTemplate) return null; // link & template saling eksklusif, doc 15 §1 TEMPLATE_LINK_CONFLICT

  if (!picking) {
    return (
      <button
        type="button"
        onClick={() => setPicking(true)}
        className="w-full flex items-center justify-center space-x-1.5 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-medium border border-dashed border-slate-700"
      >
        <Link2 className="w-3.5 h-3.5 text-indigo-400" />
        <span>Jadikan tautan…</span>
      </button>
    );
  }

  const entries = index?.entries ?? [];

  const handleSubmit = () => {
    setError(null);
    const chosen = entries.find(e => e.id === selectedId);
    const kodeOPD = chosen?.kodeOPD ?? freeKode.trim();
    const namaProject = chosen?.namaOPD ?? freeNama.trim();

    if (!kodeOPD) {
      setError('Pilih project atau isi kode OPD-nya.');
      return;
    }

    const result = makeLink(node.id, { kodeOPD, namaProject: namaProject || kodeOPD });
    if (!result.ok) {
      setError(
        result.reason === 'cycle'
          ? 'Tautan ini akan membentuk siklus (project tujuan sudah menautkan balik ke project ini).'
          : result.reason === 'has-children'
          ? 'Unit ini punya children — hapus atau pindahkan dulu sebelum dijadikan tautan.'
          : 'Node ini terkunci.'
      );
      return;
    }
    setPicking(false);
  };

  return (
    <div className="space-y-2 rounded-lg border border-slate-700 bg-slate-900/60 p-2.5">
      <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
        Jadikan Tautan
      </label>

      {entries.length > 0 && (
        <select
          value={selectedId}
          onChange={e => setSelectedId(e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 text-slate-100 rounded px-2.5 py-1.5 text-xs outline-none focus:border-blue-500"
        >
          <option value="">— Pilih project tersimpan —</option>
          {entries.map(e => (
            <option key={e.id} value={e.id}>
              {e.namaOPD} ({e.kodeOPD})
            </option>
          ))}
        </select>
      )}

      {!selectedId && (
        <>
          <p className="text-[10px] text-slate-500">
            Atau isi kode OPD-nya sendiri (belum diimpor — link resolve nanti begitu filenya ada):
          </p>
          <input
            type="text"
            placeholder="Kode OPD, mis. PKM-KTIM"
            value={freeKode}
            onChange={e => setFreeKode(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 text-slate-100 rounded px-2.5 py-1.5 text-xs outline-none focus:border-blue-500 font-mono"
          />
          <input
            type="text"
            placeholder="Nama (opsional, untuk tampilan)"
            value={freeNama}
            onChange={e => setFreeNama(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 text-slate-100 rounded px-2.5 py-1.5 text-xs outline-none focus:border-blue-500"
          />
        </>
      )}

      {error && <p className="text-[11px] text-rose-400">{error}</p>}

      <div className="flex items-center space-x-1.5">
        <button
          type="button"
          onClick={handleSubmit}
          className="flex-1 px-2 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-[11px] font-medium"
        >
          Tautkan
        </button>
        <button
          type="button"
          onClick={() => {
            setPicking(false);
            setError(null);
          }}
          className="flex-1 px-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] font-medium"
        >
          Batal
        </button>
      </div>
    </div>
  );
};
