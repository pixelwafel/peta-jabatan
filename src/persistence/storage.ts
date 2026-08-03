import { get, set, del, keys, createStore } from 'idb-keyval';
import { Project } from '@/models/project';
import { ProjectIndex, ProjectIndexEntry } from './types';
import { projectTotals } from '@/selectors/totals';

const customStore = createStore('pjb_db', 'pjb_store');

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
  return raw ?? null;
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

export async function updateIndexForProject(project: Project): Promise<void> {
  const index = await getProjectIndex();
  const existingEntry = index.entries.find(e => e.id === project.id);
  const totals = projectTotals(project.nodes);
  const posCount = project.nodes.filter(n => n.type === 'jabatan').length;

  const entry: ProjectIndexEntry = {
    id: project.id,
    namaOPD: project.meta.namaOPD || 'Tanpa Nama',
    kodeOPD: project.meta.kodeOPD || 'KODE',
    nodeCount: posCount,
    totalKebutuhan: totals.kebutuhan,
    totalEksisting: totals.eksisting,
    updatedAt: project.updatedAt,
    lastExportedAt: existingEntry?.lastExportedAt ?? null,
    origin: existingEntry?.origin ?? 'created',
  };

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

  const entries: ProjectIndexEntry[] = [];
  let activeId: string | null = null;

  for (const pk of projectKeys) {
    try {
      const p = await get<Project>(pk, customStore);
      if (p && p.id && p.meta) {
        const totals = projectTotals(p.nodes);
        const posCount = p.nodes.filter(n => n.type === 'jabatan').length;
        entries.push({
          id: p.id,
          namaOPD: p.meta.namaOPD || 'Tanpa Nama',
          kodeOPD: p.meta.kodeOPD || 'KODE',
          nodeCount: posCount,
          totalKebutuhan: totals.kebutuhan,
          totalEksisting: totals.eksisting,
          updatedAt: p.updatedAt || new Date().toISOString(),
          lastExportedAt: null,
          origin: 'created',
        });
      }
    } catch (err) {
      console.warn(`Failed reading project key ${pk}:`, err);
    }
  }

  entries.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  activeId = entries[0]?.id ?? null;

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
