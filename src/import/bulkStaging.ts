import { Project } from '@/models/project';
import { ProjectIndex } from '@/persistence/types';

export type StagingStatus = 'new' | 'replace' | 'older' | 'invalid' | 'duplicate-in-batch';

export interface ParsedFile {
  clientId: string;
  fileName: string;
  project: Project | null; // null saat parse/schema gagal
  parseFailed: boolean;
}

export interface StagedEntry {
  clientId: string;
  fileName: string;
  status: StagingStatus;
  kodeOPD: string | null; // null hanya untuk 'invalid'
  project: Project | null;
  /** id project tersimpan yang akan ditimpa — hanya terisi untuk 'replace'/'older'. */
  existingId?: string;
  message: string;
}

/**
 * Klasifikasi staging bulk import (docs/14-recap-dashboard.md §4). Replace-
 * vs-duplicate diputuskan lewat `kodeOPD`, konsisten dengan resolusi link
 * (docs/13 §2) — bukan `id` project, karena id lokal antar-file tidak
 * berhubungan sama sekali.
 *
 * Pure & testable: tidak menyentuh IndexedDB — `index` (state tersimpan
 * saat ini) di-pass sebagai parameter.
 */
export function classifyBatch(parsed: ParsedFile[], index: ProjectIndex): StagedEntry[] {
  const byKodeInStorage = new Map(index.entries.map(e => [e.kodeOPD, e]));
  const groups = new Map<string, ParsedFile[]>();
  const results: StagedEntry[] = [];

  for (const p of parsed) {
    if (p.parseFailed || !p.project) {
      results.push({
        clientId: p.clientId,
        fileName: p.fileName,
        status: 'invalid',
        kodeOPD: null,
        project: null,
        message: 'Gagal dibaca atau tidak sesuai skema proyek.',
      });
      continue;
    }

    const kodeOPD = p.project.meta.kodeOPD || 'KODE';
    const list = groups.get(kodeOPD) ?? [];
    list.push(p);
    groups.set(kodeOPD, list);
  }

  for (const [kodeOPD, group] of groups.entries()) {
    // Newest-wins dalam batch (doc 14 §4 tabel "duplicate-in-batch").
    const sorted = [...group].sort(
      (a, b) => Date.parse(b.project!.updatedAt) - Date.parse(a.project!.updatedAt)
    );
    const [primary, ...losers] = sorted;

    for (const loser of losers) {
      results.push({
        clientId: loser.clientId,
        fileName: loser.fileName,
        status: 'duplicate-in-batch',
        kodeOPD,
        project: loser.project,
        message: `Kode ${kodeOPD} dipakai ${group.length} berkas di batch ini — berkas yang lebih baru menang, ini dilewati.`,
      });
    }

    const existing = byKodeInStorage.get(kodeOPD);
    if (!existing) {
      results.push({
        clientId: primary.clientId,
        fileName: primary.fileName,
        status: 'new',
        kodeOPD,
        project: primary.project,
        message: 'Project baru — kode belum ada di penyimpanan.',
      });
      continue;
    }

    const incomingNewer = Date.parse(primary.project!.updatedAt) > Date.parse(existing.updatedAt);
    results.push({
      clientId: primary.clientId,
      fileName: primary.fileName,
      status: incomingNewer ? 'replace' : 'older',
      kodeOPD,
      project: primary.project,
      existingId: existing.id,
      message: incomingNewer
        ? `Menggantikan project tersimpan (terakhir diubah ${existing.updatedAt}). Versi lama diarsipkan.`
        : `Project tersimpan lebih baru (${existing.updatedAt}) — dilewati kecuali dipaksa.`,
    });
  }

  return results;
}
