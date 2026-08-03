import { ProjectIndexEntry } from './types';
import { getProjectIndex, saveProjectIndex } from './storage';

export function shouldRemindExport(
  entry: ProjectIndexEntry | undefined,
  snoozedProjects: Set<string> = new Set()
): boolean {
  if (!entry) return false;
  if (snoozedProjects.has(entry.id)) return false;

  if (!entry.lastExportedAt) {
    return entry.nodeCount >= 10;
  }

  const hoursSince = (Date.now() - Date.parse(entry.lastExportedAt)) / (1000 * 60 * 60);
  return hoursSince > 4 && Date.parse(entry.updatedAt) > Date.parse(entry.lastExportedAt);
}

export async function markProjectExported(projectId: string): Promise<void> {
  const index = await getProjectIndex();
  const entry = index.entries.find(e => e.id === projectId);
  if (entry) {
    entry.lastExportedAt = new Date().toISOString();
    await saveProjectIndex(index);
  }
}
