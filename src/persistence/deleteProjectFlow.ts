import { ProjectIndexEntry } from './types';
import { deleteProjectData } from './storage';

interface ConfirmOpts {
  title: string;
  body: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
}

/**
 * Konfirmasi hapus proyek — satu pertanyaan ya/tidak (openConfirm), TIDAK
 * perlu mengetik ulang nama OPD. Dipakai dari OpdListSidebar (hapus cepat)
 * maupun ProjectManagerDialog, supaya perilakunya konsisten di kedua tempat.
 */
export function requestDeleteProject(
  entry: ProjectIndexEntry,
  openConfirm: (opts: ConfirmOpts) => void,
  onDeleted: () => void | Promise<void>
): void {
  const exportNote = entry.lastExportedAt
    ? `terakhir diekspor pada ${new Date(entry.lastExportedAt).toLocaleTimeString()}.`
    : 'belum pernah diekspor — data akan hilang permanen.';

  openConfirm({
    title: `Hapus Proyek ${entry.namaOPD}?`,
    body: `Proyek ini memiliki ${entry.nodeCount} node dan ${exportNote} Tindakan ini tidak dapat dibatalkan.`,
    confirmLabel: 'Hapus Proyek',
    danger: true,
    onConfirm: async () => {
      await deleteProjectData(entry.id);
      await onDeleted();
    },
  });
}
