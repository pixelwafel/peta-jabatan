import { get, set, del, keys, createStore } from 'idb-keyval';
import { Project } from '@/models/project';
import { ProjectIndex, ProjectIndexEntry } from './types';
import { hierarchyEdges } from '@/utils/edges';
import { compareNomor } from '@/utils/numbering';
import { mergeStrukturalHeadsIntoUnits } from '@/utils/structuralMerge';

// Exported supaya modul persistence lain (mis. persistence/customOpd.ts) bisa
// simpan state kecil di database/objectStore yang sama tanpa membuka handle baru.
export const customStore = createStore('pjb_db', 'pjb_store');

const INDEX_KEY = 'pjb:v1:index';
const PROJECT_PREFIX = 'pjb:v1:project:';

export function getProjectKey(id: string): string {
  return `${PROJECT_PREFIX}${id}`;
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
 * Proyek lama tersimpan tanpa field `order` pada node (urutan sibling dulu
 * disimpulkan dari `position.x`). Migrasi sekali jalan: turunkan `order`
 * dari urutan lama supaya tampilan outline tidak berubah setelah upgrade.
 */
export function normalizeProject(project: Project): Project {
  project = normalizeStrukturalHeads(project);

  if (project.nodes.every(n => typeof n.order === 'number')) {
    return project;
  }

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

  return project;
}

/**
 * Proyek lama menyimpan posisi struktural sebagai node Jabatan terpisah di
 * bawah unitnya. Migrasi sekali jalan (idempotent, no-op setelah proyek
 * sudah bermigrasi): lipat ke `unit.kepalaUnit`. Lihat utils/structuralMerge.ts.
 */
function normalizeStrukturalHeads(project: Project): Project {
  const result = mergeStrukturalHeadsIntoUnits(project.nodes, project.edges);
  if (result.mergedCount === 0) return project;
  return { ...project, nodes: result.nodes, edges: result.edges };
}

export async function saveProject(project: Project): Promise<void> {
  const key = getProjectKey(project.id);
  await set(key, project, customStore);
  await updateIndexForProject(project);
}

export async function deleteProjectData(id: string): Promise<void> {
  const key = getProjectKey(id);
  await del(key, customStore);

  const index = await getProjectIndex();
  index.entries = index.entries.filter(e => e.id !== id);
  if (index.activeId === id) {
    index.activeId = index.entries[0]?.id ?? null;
  }
  await saveProjectIndex(index);
}

const EMPTY_PROJECT_INDEX: ProjectIndex = { version: 1, activeId: null, entries: [] };

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
 */
export async function buildIndexEntry(
  project: Project,
  carry: Pick<ProjectIndexEntry, 'lastExportedAt' | 'origin'> = { lastExportedAt: null, origin: 'created' },
  index: ProjectIndex = EMPTY_PROJECT_INDEX
): Promise<ProjectIndexEntry> {
  const posCount = project.nodes.filter(n => n.type === 'jabatan').length;

  // Import dinamis, bukan statis: selectors/validation.ts & selectors/recap.ts
  // -> (linkResolver.ts ->) store/projectStore.ts -> store/projectIndexStore.ts
  // -> balik ke modul ini (getProjectIndex). Import statis akan bikin siklus;
  // import dinamis aman karena baru di-resolve saat fungsi ini benar-benar
  // dipanggil.
  const { validateProject } = await import('@/selectors/validation');
  const { computeRecap } = await import('@/selectors/recap');
  const { taxonomy } = await import('@/config/taxonomy');

  const findings = validateProject(project);
  const findingCounts = {
    errors: findings.filter(f => f.severity === 'error').length,
    warnings: findings.filter(f => f.severity === 'warning').length,
  };

  // total dari computeRecap (bukan projectTotals) supaya link node ikut
  // teragregasi (docs/13-link-nodes.md §3) — tanpa ini, total project yang
  // punya tautan akan tampak lebih kecil dari kenyataan di dashboard.
  const totals = computeRecap(project, taxonomy, index).total;

  return {
    id: project.id,
    namaOPD: project.meta.namaOPD || 'Tanpa Nama',
    kodeOPD: project.meta.kodeOPD || 'KODE',
    nodeCount: posCount,
    totalKebutuhan: totals.kebutuhan,
    totalEksisting: totals.eksisting,
    updatedAt: project.updatedAt || new Date().toISOString(),
    lastExportedAt: carry.lastExportedAt,
    origin: carry.origin,
    // Kode OPD dari tiap link node di project ini — dipakai cycle guard
    // (selectors/linkResolver.ts canCreateLink) buat walk rantai tautan tanpa
    // perlu buka body project lain. Lihat docs/13-link-nodes.md §2.
    linkedCodes: project.nodes.filter(n => n.link).map(n => n.link!.kodeOPD),
    // Badge "N file bermasalah" di dashboard tanpa buka body (doc 14 §2).
    findingCounts,
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

  const entryIndex = index.entries.findIndex(e => e.id === project.id);
  if (entryIndex >= 0) {
    index.entries[entryIndex] = entry;
  } else {
    index.entries.push(entry);
  }

  index.activeId = project.id;
  await saveProjectIndex(index);
}

export async function rebuildIndexFromStorage(): Promise<ProjectIndex> {
  const allKeys = (await keys(customStore)) as string[];
  const projectKeys = allKeys.filter(k => typeof k === 'string' && k.startsWith(PROJECT_PREFIX));

  const bodies: Project[] = [];
  for (const pk of projectKeys) {
    try {
      const p = await get<Project>(pk, customStore);
      if (p && p.id && p.meta) bodies.push(p);
    } catch (err) {
      console.warn(`Failed reading project key ${pk}:`, err);
    }
  }

  // Two-pass: pass 1 tanpa index (linked-nya sendiri belum bisa diresolusi,
  // tapi linkedCodes-nya sudah benar) supaya pass 2 punya index lengkap untuk
  // resolusi link antar-project dalam batch yang sama.
  const pass1 = await Promise.all(bodies.map(p => buildIndexEntry(p)));
  const pass1Index: ProjectIndex = { version: 1, activeId: null, entries: pass1 };
  const entries = await Promise.all(bodies.map(p => buildIndexEntry(p, undefined, pass1Index)));

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
