import { get, set, del, keys, createStore } from 'idb-keyval';
import { Project } from '@/models/project';
import { ProjectIndex, ProjectIndexEntry, ProjectSummary } from './types';
import { hierarchyEdges } from '@/utils/edges';
import { compareNomor } from '@/utils/numbering';
import { mergeStrukturalHeadsIntoUnits } from '@/utils/structuralMerge';
import { Taxonomy } from '@/config/taxonomy';
// Fase 2.1 — import statis kembali. Siklus lama (storage.ts -> selectors/
// validation,recap -> linkResolver.ts -> store/projectStore.ts ->
// store/projectIndexStore.ts -> balik ke getProjectIndex di modul ini) sudah
// putus: linkResolver.ts tidak lagi mengimpor store (lihat
// setLiveResolveHandler di selectors/linkResolver.ts & store/linkCacheRefresh.ts).
import { getCachedValidation } from '@/selectors/validation';
import { getCachedRecap } from '@/selectors/recap';
import { taxonomy } from '@/config/taxonomy';

// Exported supaya modul persistence lain (mis. persistence/customOpd.ts) bisa
// simpan state kecil di database/objectStore yang sama tanpa membuka handle baru.
export const customStore = createStore('pjb_db', 'pjb_store');

const INDEX_KEY = 'pjb:v1:index';
const PROJECT_PREFIX = 'pjb:v1:project:';
// Fase 3.1 — prefiks terpisah, sengaja "v2" (bukan v1) supaya iterasi
// `keys()` yang memfilter PROJECT_PREFIX (mis. rebuildIndexFromStorage,
// deleteProjectData) tidak pernah salah mengira record ringkasan ini sebagai
// body project.
const SUMMARY_PREFIX = 'pjb:v2:summary:';

export function getProjectKey(id: string): string {
  return `${PROJECT_PREFIX}${id}`;
}

export function getProjectSummaryKey(id: string): string {
  return `${SUMMARY_PREFIX}${id}`;
}

export async function isIndexedDbAvailable(): Promise<boolean> {
  try {
    if (typeof indexedDB === 'undefined') return false;
    const testKey = 'pjb:test:probe';
    await set(testKey, '1', customStore);
    await del(testKey, customStore);
    return true;
  } catch {
    return false;
  }
}

export async function getProjectIndex(): Promise<ProjectIndex> {
  try {
    const raw = await get<ProjectIndex>(INDEX_KEY, customStore);
    if (raw && raw.version === 1 && Array.isArray(raw.entries)) {
      return raw;
    }
  } catch (err) {
    console.warn('Index read error, attempting rebuild:', err);
  }

  return rebuildIndexFromStorage();
}

export async function saveProjectIndex(index: ProjectIndex): Promise<void> {
  await set(INDEX_KEY, index, customStore);
}

export async function getProject(id: string): Promise<Project | null> {
  const key = getProjectKey(id);
  const raw = await get<Project>(key, customStore);
  if (!raw) return null;
  return normalizeProject(raw);
}

/**
 * Fase 3.1 — baca ringkasan tersimpan. `null` kalau belum pernah ditulis
 * (project lama dari sebelum Fase 3.1) ATAU rusak/tidak terbaca — caller
 * SELALU harus punya jalur fallback (baca body + hitung langsung), lihat
 * `isProjectSummaryFresh` dan pemakainya di selectors/globalBreakdown.ts.
 */
export async function getProjectSummary(id: string): Promise<ProjectSummary | null> {
  try {
    const raw = await get<ProjectSummary>(getProjectSummaryKey(id), customStore);
    if (raw && raw.schemaVersion === 2) return raw;
    return null;
  } catch {
    return null;
  }
}

async function saveProjectSummary(id: string, summary: ProjectSummary): Promise<void> {
  await set(getProjectSummaryKey(id), summary, customStore);
}

/**
 * Fase 3.1 — `summary.computedFrom` harus SAMA PERSIS dengan `updatedAt`
 * project saat ini. `updatedAt` di sini datang dari `ProjectIndexEntry` yang
 * SUDAH ada di memori (bagian dari index yang sudah dimuat) — caller tidak
 * pernah perlu membuka body project cuma untuk mengecek kesegaran, itu akan
 * meniadakan tujuan summary ini.
 */
export function isProjectSummaryFresh(
  summary: ProjectSummary | null,
  currentUpdatedAt: string
): summary is ProjectSummary {
  return summary !== null && summary.computedFrom === currentUpdatedAt;
}

/**
 * Sama seperti getProject, tapi juga melaporkan apakah body dimigrasi (order
 * backfill dan/atau merge kepala struktural) selama pemuatan — dipakai
 * bootstrap.ts (Fase 1.1) supaya body yang berubah karena migrasi tetap
 * ditulis sekali, sementara body yang TIDAK berubah tidak memicu autosave
 * saat project cuma dibuka/dibaca.
 */
export async function getProjectWithMigrationFlag(
  id: string
): Promise<{ project: Project; migrated: boolean } | null> {
  const key = getProjectKey(id);
  const raw = await get<Project>(key, customStore);
  if (!raw) return null;
  return normalizeProjectDetailed(raw);
}

/**
 * Proyek lama tersimpan tanpa field `order` pada node (urutan sibling dulu
 * disimpulkan dari `position.x`). Migrasi sekali jalan: turunkan `order`
 * dari urutan lama supaya tampilan outline tidak berubah setelah upgrade.
 */
export function normalizeProject(project: Project): Project {
  return normalizeProjectDetailed(project).project;
}

function normalizeProjectDetailed(project: Project): { project: Project; migrated: boolean } {
  const headsResult = normalizeStrukturalHeads(project);
  project = headsResult.project;
  let migrated = headsResult.migrated;

  if (project.nodes.every(n => typeof n.order === 'number')) {
    return { project, migrated };
  }
  migrated = true;

  const parentIdByChild = new Map<string, string>();
  for (const e of hierarchyEdges(project.edges)) {
    parentIdByChild.set(e.target, e.source);
  }

  const childrenByParent = new Map<string, typeof project.nodes>();
  for (const n of project.nodes) {
    const parentId = parentIdByChild.get(n.id) ?? '__root__';
    const siblings = childrenByParent.get(parentId) ?? [];
    siblings.push(n);
    childrenByParent.set(parentId, siblings);
  }

  for (const siblings of childrenByParent.values()) {
    siblings.sort((a, b) => {
      const byX = a.position.x - b.position.x;
      if (byX !== 0) return byX;
      if (a.nomor && b.nomor) {
        const byNomor = compareNomor(a.nomor, b.nomor);
        if (byNomor !== 0) return byNomor;
      }
      return a.nama.localeCompare(b.nama, 'id');
    });
    siblings.forEach((n, index) => {
      n.order = index;
    });
  }

  return { project, migrated };
}

/**
 * Proyek lama menyimpan posisi struktural sebagai node Jabatan terpisah di
 * bawah unitnya. Migrasi sekali jalan (idempotent, no-op setelah proyek
 * sudah bermigrasi): lipat ke `unit.kepalaUnit`. Lihat utils/structuralMerge.ts.
 */
function normalizeStrukturalHeads(project: Project): { project: Project; migrated: boolean } {
  const result = mergeStrukturalHeadsIntoUnits(project.nodes, project.edges);
  if (result.mergedCount === 0) return { project, migrated: false };
  return { project: { ...project, nodes: result.nodes, edges: result.edges }, migrated: true };
}

export async function saveProject(project: Project): Promise<void> {
  const key = getProjectKey(project.id);
  await set(key, project, customStore);
  await updateIndexForProject(project);
}

export async function deleteProjectData(id: string): Promise<void> {
  const key = getProjectKey(id);
  await del(key, customStore);
  // Fase 3.1 — hindari record ringkasan yatim (project dihapus, summary-nya
  // tertinggal). `del` pada key yang tidak ada adalah no-op aman di idb-keyval.
  await del(getProjectSummaryKey(id), customStore);

  const index = await getProjectIndex();
  index.entries = index.entries.filter(e => e.id !== id);
  if (index.activeId === id) {
    index.activeId = index.entries[0]?.id ?? null;
  }
  await saveProjectIndex(index);
}

const EMPTY_PROJECT_INDEX: ProjectIndex = { version: 1, activeId: null, entries: [] };

/**
 * Fase 3.1 (docs/20-skalabilitas-worker-virtualisasi.md §3.1) — satu tempat
 * yang menjalankan validate+recap atas sebuah Project dan membentuknya jadi
 * `ProjectSummary`. `buildIndexEntry` (di bawah) dan `saveProject` sama-sama
 * bersumber dari sini alih-alih menghitung validate/recap sendiri-sendiri —
 * WeakMap memo (Fase 1.2) di getCachedValidation/getCachedRecap membuat
 * pemanggilan berulang atas `project` yang sama (dalam window commit yang
 * sama) tetap murah, tapi tetap SATU sumber kebenaran lebih baik daripada dua
 * fungsi yang bisa diam-diam melenceng.
 */
export function buildProjectSummary(
  project: Project,
  cfg: Taxonomy = taxonomy,
  index: ProjectIndex = EMPTY_PROJECT_INDEX
): ProjectSummary {
  const findings = getCachedValidation(project, cfg, index);
  const findingCounts = {
    errors: findings.filter(f => f.severity === 'error').length,
    warnings: findings.filter(f => f.severity === 'warning').length,
  };

  const recap = getCachedRecap(project, cfg, index);

  return {
    schemaVersion: 2,
    computedFrom: project.updatedAt || new Date().toISOString(),
    total: recap.total,
    perKategori: recap.perKategori,
    perJenjang: recap.perJenjang,
    unplaced: recap.unplaced,
    nodeCount: project.nodes.filter(n => n.type === 'jabatan').length,
    findingCounts,
    linkedCodes: project.nodes.filter(n => n.link).map(n => n.link!.kodeOPD),
  };
}

/**
 * Bangun ProjectIndexEntry dari sebuah Project — dipakai baik oleh
 * `updateIndexForProject` (satu project, incremental) maupun
 * `rebuildIndexFromStorage` (semua project, dari nol). Diekstrak jadi fungsi
 * murni supaya bisa ditest tanpa IndexedDB (lihat tests/persistence.test.ts).
 *
 * `index` (opsional): index project-project LAIN yang sudah ada, dipakai
 * untuk resolusi link node (docs/13 §2) supaya totalKebutuhan/totalEksisting
 * project ini SUDAH menyertakan kontribusi link-nya — inilah yang membuat
 * "government total = jumlah topLevel entries" di dashboard (doc 14 §2)
 * valid tanpa perlu membuka body project lain lagi di sana.
 *
 * Fase 3.1: sekarang tinggal memetik field dari `buildProjectSummary` —
 * `ProjectIndexEntry` adalah "irisan tipis" dari `ProjectSummary` ditambah
 * beberapa field yang tidak dihitung (nama/kode/carry).
 */
export async function buildIndexEntry(
  project: Project,
  carry: Pick<ProjectIndexEntry, 'lastExportedAt' | 'origin'> = { lastExportedAt: null, origin: 'created' },
  index: ProjectIndex = EMPTY_PROJECT_INDEX
): Promise<ProjectIndexEntry> {
  const summary = buildProjectSummary(project, taxonomy, index);

  return {
    id: project.id,
    namaOPD: project.meta.namaOPD || 'Tanpa Nama',
    kodeOPD: project.meta.kodeOPD || 'KODE',
    nodeCount: summary.nodeCount,
    totalKebutuhan: summary.total.kebutuhan,
    totalEksisting: summary.total.eksisting,
    updatedAt: summary.computedFrom,
    lastExportedAt: carry.lastExportedAt,
    origin: carry.origin,
    // Kode OPD dari tiap link node di project ini — dipakai cycle guard
    // (selectors/linkResolver.ts canCreateLink) buat walk rantai tautan tanpa
    // perlu buka body project lain. Lihat docs/13-link-nodes.md §2.
    linkedCodes: summary.linkedCodes,
    // Badge "N file bermasalah" di dashboard tanpa buka body (doc 14 §2).
    findingCounts: summary.findingCounts,
  };
}

export async function updateIndexForProject(project: Project): Promise<void> {
  const index = await getProjectIndex();
  const existingEntry = index.entries.find(e => e.id === project.id);

  const entry = await buildIndexEntry(
    project,
    {
      lastExportedAt: existingEntry?.lastExportedAt ?? null,
      origin: existingEntry?.origin ?? 'created',
    },
    index
  );

  // Fase 3.1 — tulis ringkasan di samping index entry, dalam batch async yang
  // sama. `getCachedRecap`/`getCachedValidation` yang dipakai `buildIndexEntry`
  // di atas (lewat buildProjectSummary) sudah menghitungnya; panggilan kedua
  // ini adalah cache-hit (WeakMap Fase 1.2), bukan komputasi ulang dari nol.
  await saveProjectSummary(project.id, buildProjectSummary(project, taxonomy, index));

  const entryIndex = index.entries.findIndex(e => e.id === project.id);
  if (entryIndex >= 0) {
    index.entries[entryIndex] = entry;
  } else {
    index.entries.push(entry);
  }

  index.activeId = project.id;
  await saveProjectIndex(index);
}

/**
 * Fase 2.3 — memori terbatas: SEBELUMNYA fungsi ini menahan seluruh isi
 * `bodies: Project[]` di memori sepanjang eksekusi (ratusan OPD × body
 * penuh, sekaligus). Sekarang tiap pass membaca satu body dari IndexedDB,
 * memakainya untuk `buildIndexEntry`, lalu MELEPASNYA (tidak disimpan ke
 * array) sebelum lanjut ke key berikutnya — jejak memori tambahan ~O(1
 * body) alih-alih O(N body), dengan harga N key dibaca dua kali (sekali per
 * pass). idb-keyval tidak mengekspos cursor sungguhan (`keys()`/`entries()`
 * sudah membuffer semuanya), jadi "cursor-based" di sini berarti iterasi
 * key-demi-key lewat `get()`, bukan cursor IDB literal — cukup untuk tujuan
 * yang sama: tidak pernah menahan N body sekaligus.
 */
export async function rebuildIndexFromStorage(): Promise<ProjectIndex> {
  const allKeys = (await keys(customStore)) as string[];
  const projectKeys = allKeys.filter(k => typeof k === 'string' && k.startsWith(PROJECT_PREFIX));

  // Pass 1: bangun entry tanpa index (linkedCodes-nya sendiri sudah benar,
  // tapi resolusi link ANTAR-project dalam batch ini belum bisa) — dipakai
  // sebagai `index` pass 2. Body project TIDAK disimpan di antara iterasi.
  const pass1: ProjectIndexEntry[] = [];
  for (const pk of projectKeys) {
    try {
      const p = await get<Project>(pk, customStore);
      if (p && p.id && p.meta) pass1.push(await buildIndexEntry(p));
    } catch (err) {
      console.warn(`Failed reading project key ${pk}:`, err);
    }
  }
  const pass1Index: ProjectIndex = { version: 1, activeId: null, entries: pass1 };

  // Pass 2: baca ulang tiap body (sekali lagi, satu per satu) supaya
  // resolusi link antar-project punya index lengkap dari pass 1. Fase 3.1 —
  // sekalian tulis ulang ProjectSummary di sini: body-nya SUDAH di tangan di
  // pass ini (tidak ada baca tambahan), jadi rebuild penuh juga
  // menyembuhkan summary yang hilang/rusak/basi untuk SEMUA project sekaligus.
  const entries: ProjectIndexEntry[] = [];
  for (const pk of projectKeys) {
    try {
      const p = await get<Project>(pk, customStore);
      if (p && p.id && p.meta) {
        entries.push(await buildIndexEntry(p, undefined, pass1Index));
        await saveProjectSummary(p.id, buildProjectSummary(p, taxonomy, pass1Index));
      }
    } catch (err) {
      console.warn(`Failed reading project key ${pk}:`, err);
    }
  }

  entries.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  const activeId = entries[0]?.id ?? null;

  const newIndex: ProjectIndex = {
    version: 1,
    activeId,
    entries,
  };

  await set(INDEX_KEY, newIndex, customStore);
  return newIndex;
}

export async function estimateStorageUsage(): Promise<{
  usedBytes: number;
  quotaBytes: number;
  percentUsed: number;
}> {
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
