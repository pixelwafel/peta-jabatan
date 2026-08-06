import { useCallback } from 'react';
import { useProjectStore } from '@/store/projectStore';
import { useUiStore } from '@/store/uiStore';
import { computeDeleteImpact } from '@/selectors/deleteImpact';

/**
 * Titik tunggal untuk semua tombol/shortcut "Hapus node" (TreeView, canvas,
 * keyboard) — sebelumnya tiap entry point memanggil `deleteNode(id, 'node-only')`
 * langsung tanpa konfirmasi, membuat pengguna tidak sadar anak-anak node yang
 * dihapus itu bukan ikut terhapus, melainkan "naik" jadi anak dari atasannya —
 * dan kalau node yang dihapus TIDAK berinduk (mis. root OPD), anak-anaknya
 * malah jadi node terpisah tanpa induk sama sekali (bug yang dilaporkan:
 * "muncul node yang terisolasi dan berdiri sendiri").
 *
 * - Node tanpa anak: hapus langsung dengan konfirmasi sederhana (tidak ada
 *   pilihan mode karena tidak ada bedanya).
 * - Node dengan anak: buka dialog 2 pilihan (`DeleteNodeDialogState`) supaya
 *   konsekuensinya eksplisit sebelum dieksekusi, termasuk peringatan khusus
 *   kalau node ini sendiri tidak berinduk.
 */
export function useDeleteNodeRequest() {
  // Fase 1.5: dulu hook ini subscribe ke SELURUH s.project dan mengembalikan
  // closure baru tiap render — dua-duanya membatalkan manfaat React.memo di
  // TreeRow (satu prop dengan identitas baru tiap keystroke = shallow compare
  // memo gagal untuk SEMUA baris, bukan cuma tombol Hapus). Baca project
  // fresh via getState() saat benar-benar dipanggil, dan bungkus useCallback
  // supaya referensi fungsi yang dikembalikan stabil.
  const deleteNode = useProjectStore(s => s.deleteNode);
  const openConfirm = useUiStore(s => s.openConfirm);
  const openDeleteNodeDialog = useUiStore(s => s.openDeleteNodeDialog);

  return useCallback(
    (id: string) => {
      const project = useProjectStore.getState().project;
      if (!project) return;
      const node = project.nodes.find(n => n.id === id);
      if (!node) return;

      const { directChildCount, subtreeCount, hasParent } = computeDeleteImpact(
        project.nodes,
        project.edges,
        id
      );

      if (directChildCount === 0) {
        openConfirm({
          title: `Hapus "${node.nama}"?`,
          body: 'Node ini akan dihapus dari struktur. Tindakan ini bisa di-undo.',
          confirmLabel: 'Hapus',
          danger: true,
          onConfirm: () => deleteNode(id, 'node-only'),
        });
        return;
      }

      openDeleteNodeDialog({
        nodeName: node.nama,
        directChildCount,
        subtreeCount,
        orphanWarning: !hasParent,
        onDeleteNodeOnly: () => deleteNode(id, 'node-only'),
        onDeleteSubtree: () => deleteNode(id, 'subtree'),
      });
    },
    [deleteNode, openConfirm, openDeleteNodeDialog]
  );
}
