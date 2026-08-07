import { getPjbV2Db } from './db';
import { Project } from '@/models/project';
import { ProjectIndex, ProjectIndexEntry, ProjectSummary } from './types';
import { buildIndexEntry, buildProjectSummary, normalizeProjectDetailed, pickMostRecentId } from './projectBuilders';

/**
 * Fase 3.2 (docs/20-skalabilitas-worker-virtualisasi.md §3.2) — kontrak
 * formal untuk baca/tulis project. `persistence/storage.ts` (permukaan
 * publik yang SUDAH dipakai seluruh app — komponen, worker, store) tetap
 * mengekspor fungsi top-level dengan nama/signature yang SAMA seperti
 * sebelum Fase 3.2; fungsi itu sekarang cuma memanggil `repository` di sini.
 * TIDAK ADA call site di luar `persistence/` yang perlu tahu interface ini
 * ada — ini murni penataan internal + sambungan siap pakai untuk Fase 4
 * (`HttpRepository` nanti implement interface yang sama).
 */
export interface ProjectRepository {
  getProjectIndex(): Promise<ProjectIndex>;
  getProject(id: string): Promise<Project | null>;
  getProjectWithMigrationFlag(id: string): Promise<{ project: Project; migrated: boolean } | null>;
  getProjectSummary(id: string): Promise<ProjectSummary | null>;
  /** Body + entry + summary + activeId, satu transaksi. Dipakai jalur
   * interaktif (autosave, buat/duplikat/ganti project). */
  saveProject(project: Project): Promise<void>;
  deleteProjectData(id: string): Promise<void>;
  /** Bulk-replace SELURUH entries + activeId — dipakai HANYA oleh
   * `rebuildIndexFromStorage` (yang memang O(N)), BUKAN jalur interaktif. */
  saveProjectIndex(index: ProjectIndex): Promise<void>;
  rebuildIndexFromStorage(): Promise<ProjectIndex>;
  estimateStorageUsage(): Promise<{ usedBytes: number; quotaBytes: number; percentUsed: number }>;

  // Fase 3.2 — TIGA method di bawah TIDAK ada di rencana awal doc 20 §3.2
  // (yang menyebut ~8 fungsi). Ditambah karena tujuan "single-project write
  // = O(1)" tidak tercapai kalau bulkImport.ts/reminder.ts tetap membaca-ubah-
  // tulis SELURUH index seperti sebelumnya — lihat catatan deviasi di doc 20.
  /** Tulis body TANPA menyentuh entry/summary/activeId — fase 1 two-phase
   * commit bulk import (persistence/bulkImport.ts). */
  putProjectBody(project: Project): Promise<void>;
  /** Hapus body — rollback fase 1 bulk import. */
  deleteProjectBody(id: string): Promise<void>;
  /** Tulis entry+summary untuk SEKUMPULAN project sekaligus (satu transaksi),
   * TANPA menyentuh activeId — fase 2 two-phase commit bulk import (batch
   * yang di-commit TIDAK pernah membuat satu pun project di dalamnya otomatis
   * jadi aktif, perilaku ini dipertahankan persis dari sebelum Fase 3.2). */
  writeEntriesAndSummaries(
    items: Array<{ project: Project; carry: Pick<ProjectIndexEntry, 'lastExportedAt' | 'origin'> }>
  ): Promise<ProjectIndexEntry[]>;
  /** Patch SATU field pada SATU entry — persistence/reminder.ts
   * `markProjectExported`, dulu baca-ubah-tulis seluruh index untuk ini. */
  patchLastExportedAt(id: string, iso: string): Promise<void>;
}

class IdbRepository implements ProjectRepository {
  async getProjectIndex(): Promise<ProjectIndex> {
    const db = await getPjbV2Db();
    const [entries, activeId] = await Promise.all([db.getAll('entries'), db.get('meta', 'activeId')]);
    return { version: 1, activeId: activeId ?? null, entries };
  }

  async getProject(id: string): Promise<Project | null> {
    const db = await getPjbV2Db();
    const raw = await db.get('projects', id);
    if (!raw) return null;
    return normalizeProjectDetailed(raw).project;
  }

  async getProjectWithMigrationFlag(
    id: string
  ): Promise<{ project: Project; migrated: boolean } | null> {
    const db = await getPjbV2Db();
    const raw = await db.get('projects', id);
    if (!raw) return null;
    return normalizeProjectDetailed(raw);
  }

  async getProjectSummary(id: string): Promise<ProjectSummary | null> {
    // Kontrak dari Fase 3.1 dipertahankan: null pada KEGAGALAN APA PUN
    // (bukan cuma "belum pernah ditulis"), bukan cuma "record tidak ada" —
    // computeGlobalBreakdown (selectors/globalBreakdown.ts) SELALU punya
    // jalur fallback (readProject) untuk kasus ini, jadi try/catch di sini
    // aman: tidak pernah menyembunyikan hilangnya data, cuma menghindari
    // exception pada operasi yang secara desain best-effort/opsional.
    try {
      const db = await getPjbV2Db();
      const raw = await db.get('summaries', id);
      return raw && raw.schemaVersion === 2 ? raw : null;
    } catch {
      return null;
    }
  }

  async saveProject(project: Project): Promise<void> {
    const db = await getPjbV2Db();
    const [existingEntry, allEntries] = await Promise.all([
      db.get('entries', project.id),
      db.getAll('entries'),
    ]);
    // Resolusi link (docs/13 §2) butuh index project LAIN yang sudah ada —
    // dibaca sekali di sini (sama seperti updateIndexForProject versi lama),
    // tapi TULISNYA sekarang satu record per store, bukan RMW seluruh blob.
    const index: ProjectIndex = { version: 1, activeId: null, entries: allEntries };

    const entry = buildIndexEntry(
      project,
      { lastExportedAt: existingEntry?.lastExportedAt ?? null, origin: existingEntry?.origin ?? 'created' },
      index
    );
    const summary = buildProjectSummary(project, undefined, index);

    const tx = db.transaction(['projects', 'entries', 'summaries', 'meta'], 'readwrite');
    await Promise.all([
      tx.objectStore('projects').put(project),
      tx.objectStore('entries').put(entry),
      tx.objectStore('summaries').put(summary, project.id),
      tx.objectStore('meta').put(project.id, 'activeId'),
      tx.done,
    ]);
  }

  async deleteProjectData(id: string): Promise<void> {
    const db = await getPjbV2Db();
    const [activeId, remainingEntries] = await Promise.all([db.get('meta', 'activeId'), db.getAll('entries')]);
    const nextActiveId = activeId === id ? remainingEntries.find(e => e.id !== id)?.id ?? null : activeId ?? null;

    const tx = db.transaction(['projects', 'entries', 'summaries', 'meta'], 'readwrite');
    await Promise.all([
      tx.objectStore('projects').delete(id),
      tx.objectStore('entries').delete(id),
      tx.objectStore('summaries').delete(id),
      tx.objectStore('meta').put(nextActiveId, 'activeId'),
      tx.done,
    ]);
  }

  async saveProjectIndex(index: ProjectIndex): Promise<void> {
    const db = await getPjbV2Db();
    const tx = db.transaction(['entries', 'meta'], 'readwrite');
    await tx.objectStore('entries').clear();
    await Promise.all([
      ...index.entries.map(e => tx.objectStore('entries').put(e)),
      tx.objectStore('meta').put(index.activeId, 'activeId'),
      tx.done,
    ]);
  }

  /**
   * Fase 2.3 menulis ulang versi idb-keyval fungsi ini supaya memori terbatas
   * lewat baca-lepas key-demi-key (idb-keyval tidak punya cursor sungguhan).
   * `idb` PUNYA cursor sungguhan — dipakai di sini apa adanya, satu body per
   * waktu, tanpa perlu trik baca-dua-pass yang dulu jadi kompromi.
   */
  async rebuildIndexFromStorage(): Promise<ProjectIndex> {
    const db = await getPjbV2Db();

    const bodies: Project[] = [];
    let cursor = await db.transaction('projects').store.openCursor();
    while (cursor) {
      bodies.push(cursor.value);
      cursor = await cursor.continue();
    }

    // Two-pass (sama seperti sebelumnya): pass 1 tanpa index antar-project
    // (linkedCodes sendiri sudah benar, resolusi link ANTAR-project belum),
    // dipakai sebagai `index` pass 2.
    const pass1Index: ProjectIndex = { version: 1, activeId: null, entries: bodies.map(p => buildIndexEntry(p)) };

    const entries = bodies.map(p => buildIndexEntry(p, undefined, pass1Index));
    const summaries = bodies.map(p => buildProjectSummary(p, undefined, pass1Index));

    entries.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    const activeId = pickMostRecentId(entries);

    const tx = db.transaction(['entries', 'summaries', 'meta'], 'readwrite');
    await tx.objectStore('entries').clear();
    await tx.objectStore('summaries').clear();
    await Promise.all([
      ...entries.map(e => tx.objectStore('entries').put(e)),
      ...bodies.map((p, i) => tx.objectStore('summaries').put(summaries[i], p.id)),
      tx.objectStore('meta').put(activeId, 'activeId'),
      tx.done,
    ]);

    return { version: 1, activeId, entries };
  }

  async estimateStorageUsage(): Promise<{ usedBytes: number; quotaBytes: number; percentUsed: number }> {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
      try {
        const est = await navigator.storage.estimate();
        const usedBytes = est.usage ?? 0;
        const quotaBytes = est.quota ?? 50 * 1024 * 1024;
        const percentUsed = Math.min(100, (usedBytes / quotaBytes) * 100);
        return { usedBytes, quotaBytes, percentUsed };
      } catch {
        // Fallback
      }
    }
    return { usedBytes: 0, quotaBytes: 50 * 1024 * 1024, percentUsed: 0 };
  }

  async putProjectBody(project: Project): Promise<void> {
    const db = await getPjbV2Db();
    await db.put('projects', project);
  }

  async deleteProjectBody(id: string): Promise<void> {
    const db = await getPjbV2Db();
    await db.delete('projects', id);
  }

  async writeEntriesAndSummaries(
    items: Array<{ project: Project; carry: Pick<ProjectIndexEntry, 'lastExportedAt' | 'origin'> }>
  ): Promise<ProjectIndexEntry[]> {
    if (items.length === 0) return [];
    const db = await getPjbV2Db();
    const allEntries = await db.getAll('entries');
    const index: ProjectIndex = { version: 1, activeId: null, entries: allEntries };

    const built = items.map(({ project, carry }) => ({
      id: project.id,
      entry: buildIndexEntry(project, carry, index),
      summary: buildProjectSummary(project, undefined, index),
    }));

    const tx = db.transaction(['entries', 'summaries'], 'readwrite');
    await Promise.all([
      ...built.map(b => tx.objectStore('entries').put(b.entry)),
      ...built.map(b => tx.objectStore('summaries').put(b.summary, b.id)),
      tx.done,
    ]);

    return built.map(b => b.entry);
  }

  async patchLastExportedAt(id: string, iso: string): Promise<void> {
    const db = await getPjbV2Db();
    const entry = await db.get('entries', id);
    if (!entry) return;
    await db.put('entries', { ...entry, lastExportedAt: iso });
  }
}

export const repository: ProjectRepository = new IdbRepository();
