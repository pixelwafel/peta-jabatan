import type { Project } from '@/models/project';
import type { Taxonomy } from '@/config/taxonomy';
import { taxonomy as defaultTaxonomy } from '@/config/taxonomy';
import type { ProjectIndex, ProjectIndexEntry } from '@/persistence/types';
import type { Finding, Recap, RecapBucket } from '@/models/derived';
import type { GlobalBreakdownOptions } from '@/selectors/globalBreakdown';
import type { WorkerRequest, WorkerResponse } from './protocol';

// Fase 2.2 — jembatan main thread <-> analysis.worker.ts.
//
// Vitest jalan dengan `environment: 'node'` (lihat vite.config.ts), di mana
// `Worker` tidak ada. `typeof Worker === 'undefined'` di bawah adalah satu-
// satunya cabang jalur — kalau true, setiap operasi memanggil fungsi murni
// yang sama persis secara inline, jadi 30+ suite test yang ada tetap hijau
// tanpa perlu tahu worker ini ada. Browser sungguhan selalu ambil cabang
// worker.
export interface AnalysisWorkerClient {
  validate(project: Project, cfg?: Taxonomy, index?: ProjectIndex): Promise<Finding[]>;
  recap(project: Project, cfg?: Taxonomy, index?: ProjectIndex): Promise<Recap>;
  indexEntry(
    project: Project,
    carry?: Pick<ProjectIndexEntry, 'lastExportedAt' | 'origin'>,
    index?: ProjectIndex
  ): Promise<ProjectIndexEntry>;
  globalBreakdown(
    topLevel: ProjectIndexEntry[],
    opts?: GlobalBreakdownOptions
  ): Promise<RecapBucket[]>;
  /** Hentikan worker (kalau ada) — panggil saat komponen yang membuat client unmount. */
  terminate(): void;
}

const DEFAULT_CARRY: Pick<ProjectIndexEntry, 'lastExportedAt' | 'origin'> = {
  lastExportedAt: null,
  origin: 'created',
};
const EMPTY_INDEX: ProjectIndex = { version: 1, activeId: null, entries: [] };

function createInlineClient(): AnalysisWorkerClient {
  // Fallback sinkron-dibungkus-Promise — dipakai di Vitest (`environment:
  // 'node'`) dan sebagai jaring pengaman kalau Worker gagal dibuat (mis.
  // CSP browser lama). Memanggil fungsi murni yang sama yang dipanggil
  // worker, jadi hasilnya identik, hanya tanpa berpindah thread.
  return {
    async validate(project, cfg, index) {
      const { validateProject } = await import('@/selectors/validation');
      return validateProject(project, cfg, index);
    },
    async recap(project, cfg, index) {
      const { computeRecap } = await import('@/selectors/recap');
      return computeRecap(project, cfg, index);
    },
    async indexEntry(project, carry = DEFAULT_CARRY, index = EMPTY_INDEX) {
      const { buildIndexEntry } = await import('@/persistence/storage');
      return buildIndexEntry(project, carry, index);
    },
    async globalBreakdown(topLevel, opts) {
      const { computeGlobalBreakdown } = await import('@/selectors/globalBreakdown');
      const { getProject, getProjectSummary } = await import('@/persistence/storage');
      // Fase 3.1 — sama seperti analysis.worker.ts: readSummary dicoba lebih
      // dulu, getProject cuma fallback untuk summary yang hilang/basi.
      return computeGlobalBreakdown(topLevel, getProject, { ...opts, readSummary: getProjectSummary });
    },
    terminate() {
      // no-op — tidak ada worker untuk dihentikan.
    },
  };
}

function createRealWorkerClient(): AnalysisWorkerClient {
  const worker = new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' });

  let nextId = 1;
  const pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: unknown) => void; onProgress?: (done: number, total: number) => void }
  >();

  worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
    const msg = ev.data;
    const entry = pending.get(msg.id);
    if (!entry) return; // sudah selesai/dibatalkan sebelumnya

    if (msg.type === 'progress') {
      entry.onProgress?.(msg.done, msg.total);
      return;
    }
    pending.delete(msg.id);
    if (msg.type === 'result') {
      entry.resolve(msg.result);
    } else {
      entry.reject(new Error(msg.message));
    }
  };

  function send<T>(
    req: Omit<WorkerRequest, 'id'>,
    opts?: { signal?: AbortSignal; onProgress?: (done: number, total: number) => void }
  ): Promise<T> {
    const id = nextId++;
    return new Promise<T>((resolve, reject) => {
      pending.set(id, { resolve: v => resolve(v as T), reject, onProgress: opts?.onProgress });

      if (opts?.signal) {
        if (opts.signal.aborted) {
          pending.delete(id);
          reject(new Error('aborted'));
          return;
        }
        opts.signal.addEventListener(
          'abort',
          () => {
            worker.postMessage({ op: 'cancel', id });
            // computeGlobalBreakdown di worker berhenti bersih dan tetap
            // resolve dengan hasil parsial (lihat tests/global-breakdown.test.ts
            // untuk perilaku non-worker yang sama) — jangan reject di sini,
            // biarkan resolusi normal dari worker yang menang.
          },
          { once: true }
        );
      }

      worker.postMessage({ ...req, id } as WorkerRequest);
    });
  }

  return {
    validate(project, cfg: Taxonomy = defaultTaxonomy, index = EMPTY_INDEX) {
      return send<Finding[]>({ op: 'validate', project, cfg, index } as Omit<WorkerRequest, 'id'>);
    },
    recap(project, cfg: Taxonomy = defaultTaxonomy, index = EMPTY_INDEX) {
      return send<Recap>({ op: 'recap', project, cfg, index } as Omit<WorkerRequest, 'id'>);
    },
    indexEntry(project, carry = DEFAULT_CARRY, index = EMPTY_INDEX) {
      return send<ProjectIndexEntry>({ op: 'indexEntry', project, carry, index } as Omit<WorkerRequest, 'id'>);
    },
    globalBreakdown(topLevel, opts) {
      return send<RecapBucket[]>({ op: 'globalBreakdown', topLevel } as Omit<WorkerRequest, 'id'>, opts);
    },
    terminate() {
      worker.terminate();
    },
  };
}

export function createAnalysisWorkerClient(): AnalysisWorkerClient {
  if (typeof Worker === 'undefined') {
    return createInlineClient();
  }
  try {
    return createRealWorkerClient();
  } catch {
    // Konstruksi Worker gagal (mis. CSP, module worker tak didukung) —
    // jangan pernah mematikan app, mundur ke jalur inline.
    return createInlineClient();
  }
}
