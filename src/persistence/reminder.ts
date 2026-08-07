import { ProjectIndexEntry } from './types';
import { repository } from './repository';

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

/** Fase 3.2 — patch SATU field pada SATU entry (`repository.patchLastExportedAt`),
 * bukan baca-ubah-tulis SELURUH index seperti sebelumnya. Ini jalur yang
 * dipanggil tiap export berhasil — salah satu yang paling sering dipanggil
 * dari semua tulisan index, jadi RMW-seluruh-blob di sini paling terasa di
 * skala ratusan OPD. */
export async function markProjectExported(projectId: string): Promise<void> {
  await repository.patchLastExportedAt(projectId, new Date().toISOString());
}
