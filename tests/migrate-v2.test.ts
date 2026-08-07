import { describe, it, expect } from 'vitest';
import { isV2Migrated } from '../src/persistence/migrateV2';

// Fase 3.2 — cakupan test di sini SENGAJA terbatas: migrateV2() sendiri
// (dan hampir semua fungsi di persistence/repository.ts) menyentuh
// IndexedDB sungguhan lewat `idb`/`idb-keyval`, dan repo ini TIDAK punya
// `fake-indexeddb` (environment: 'node' di vite.config.ts) — pola yang
// SUDAH ada sebelum Fase 3 (buildIndexEntry dkk selalu ditest sebagai
// fungsi murni, tidak pernah lewat saveProject/getProject beneran). Lihat
// catatan strategi test yang sama di docs/20-skalabilitas-worker-virtualisasi.md
// §3.1 — Fase 3.2 mengikuti pola itu secara konsisten.
//
// Yang ditest di sini murni bagian yang AMAN dipanggil tanpa IndexedDB:
// `isV2Migrated()` cuma baca LocalStorage (tidak ada di `environment: 'node'`
// juga, tapi dibungkus try/catch — harus gagal AMAN, bukan throw).
describe('isV2Migrated (Fase 3.2)', () => {
  it('returns false without throwing when localStorage is unavailable (Vitest node environment)', () => {
    expect(() => isV2Migrated()).not.toThrow();
    expect(isV2Migrated()).toBe(false);
  });
});
