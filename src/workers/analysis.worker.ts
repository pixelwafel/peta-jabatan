// Fase 2.2 — worker analisis. Hanya mengimpor pulau bebas-store (selectors/
// config/models, ditegakkan scripts/check-layering.mjs) plus
// persistence/storage.ts untuk buildIndexEntry (murni) dan getProject
// (dipakai sebagai readProject computeGlobalBreakdown — worker punya handle
// idb-keyval sendiri, body project tidak pernah dideserialisasi di main
// thread untuk operasi ini).
//
// Catatan tipe: tsconfig proyek ini pakai lib "DOM" (untuk kode React di
// main thread), bukan "WebWorker" — dua lib itu tidak bisa digabung dalam
// satu program TS tanpa tsconfig terpisah per file. Daripada menambah
// project reference baru hanya untuk satu file, batas worker ini sengaja
// diketik longgar (`ctx: any`) — payload di kedua sisi tetap penuh-tipe
// lewat WorkerRequest/WorkerResponse.
import { validateProject } from '@/selectors/validation';
import { computeRecap } from '@/selectors/recap';
import { computeGlobalBreakdown } from '@/selectors/globalBreakdown';
import { buildIndexEntry, getProject, getProjectSummary } from '@/persistence/storage';
import type { WorkerRequest, WorkerResponse } from './protocol';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ctx: any = typeof self !== 'undefined' ? self : undefined;

// Satu AbortController per request id yang masih berjalan — 'cancel'
// (dikirim client.ts saat AbortSignal caller ter-trigger) meng-abort
// controller yang cocok; computeGlobalBreakdown sendiri sudah berhenti
// bersih di iterasi berikutnya (lihat tests/global-breakdown.test.ts).
const controllers = new Map<number, AbortController>();

function post(msg: WorkerResponse): void {
  ctx.postMessage(msg);
}

ctx.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data;

  if (msg.op === 'cancel') {
    controllers.get(msg.id)?.abort();
    return;
  }

  try {
    switch (msg.op) {
      case 'validate': {
        const result = validateProject(msg.project, msg.cfg, msg.index);
        post({ id: msg.id, type: 'result', result });
        break;
      }
      case 'recap': {
        const result = computeRecap(msg.project, msg.cfg, msg.index);
        post({ id: msg.id, type: 'result', result });
        break;
      }
      case 'indexEntry': {
        const result = await buildIndexEntry(msg.project, msg.carry, msg.index);
        post({ id: msg.id, type: 'result', result });
        break;
      }
      case 'globalBreakdown': {
        const controller = new AbortController();
        controllers.set(msg.id, controller);
        try {
          // Fase 3.1 — readSummary dicoba lebih dulu per project (summary
          // fresh -> body TIDAK pernah dibaca); getProject cuma jadi
          // fallback untuk summary yang hilang/basi.
          const result = await computeGlobalBreakdown(msg.topLevel, getProject, {
            signal: controller.signal,
            onProgress: (done, total) => post({ id: msg.id, type: 'progress', done, total }),
            readSummary: getProjectSummary,
          });
          post({ id: msg.id, type: 'result', result });
        } finally {
          controllers.delete(msg.id);
        }
        break;
      }
    }
  } catch (err) {
    post({ id: msg.id, type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
