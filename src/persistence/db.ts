import { DBSchema, IDBPDatabase, openDB } from 'idb';
import { Project } from '@/models/project';
import { ProjectIndexEntry, ProjectSummary } from './types';

/**
 * Fase 3.2 (docs/20-skalabilitas-worker-virtualisasi.md §3.2) — skema
 * IndexedDB sungguhan lewat `idb` (transaksi + index sungguhan), menggantikan
 * peran `idb-keyval`'s satu-object-store-datar untuk data yang jadi masalah
 * skala: body project, index entry, ringkasan (Fase 3.1).
 *
 * Database TERPISAH (`pjb_v2`, bukan menambah store ke `pjb_db` yang sudah
 * dipakai idb-keyval) — sengaja: idb-keyval membuka `pjb_db` tanpa mengekspos
 * hook `upgrade`, jadi menambah object store ke situ butuh trik version-bump
 * yang rapuh (dua library berbeda sama-sama mengklaim hak atas skema db yang
 * sama). Dua database terpisah co-exist aman di IndexedDB. `pjb_db`
 * (idb-keyval, lihat persistence/storage.ts `customStore`) TETAP dipakai
 * untuk data yang BUKAN bagian dari masalah skala ini — daftar OPD kustom
 * (persistence/customOpd.ts) dan arsip satu-generasi (persistence/bulkImport.ts
 * `archiveProject`) — sengaja TIDAK dipindah, lihat catatan "batas migrasi"
 * di docs/20 §3.2.
 */
export interface PjbV2Schema extends DBSchema {
  projects: {
    key: string; // Project.id
    value: Project;
  };
  entries: {
    key: string; // ProjectIndexEntry.id
    value: ProjectIndexEntry;
    indexes: { 'by-kodeOPD': string; 'by-updatedAt': string };
  };
  summaries: {
    key: string; // project id (ProjectSummary sendiri tidak punya field id)
    value: ProjectSummary;
  };
  meta: {
    key: string; // 'activeId'
    value: string | null;
  };
}

const DB_NAME = 'pjb_v2';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<PjbV2Schema>> | null = null;

export function getPjbV2Db(): Promise<IDBPDatabase<PjbV2Schema>> {
  if (!dbPromise) {
    dbPromise = openDB<PjbV2Schema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('projects')) {
          db.createObjectStore('projects', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('entries')) {
          const store = db.createObjectStore('entries', { keyPath: 'id' });
          store.createIndex('by-kodeOPD', 'kodeOPD');
          store.createIndex('by-updatedAt', 'updatedAt');
        }
        if (!db.objectStoreNames.contains('summaries')) {
          db.createObjectStore('summaries');
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta');
        }
      },
    });
  }
  return dbPromise;
}

/** Dipakai tests/dev tooling untuk mulai dari database bersih — TIDAK dipanggil
 * dari kode aplikasi manapun. */
export function resetPjbV2DbHandleForTests(): void {
  dbPromise = null;
}
