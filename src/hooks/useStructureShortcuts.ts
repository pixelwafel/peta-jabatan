import { useEffect } from 'react';
import { useProjectStore } from '@/store/projectStore';
import { useUiStore } from '@/store/uiStore';
import { hierarchyEdges } from '@/utils/edges';
import { useDeleteNodeRequest } from './useDeleteNodeRequest';

/**
 * Keyboard shortcuts for editing struktur (add/duplicate/delete/undo/redo).
 * Diekstrak dari Canvas.tsx — shortcut fit-view/Escape TETAP di Canvas karena
 * itu konsep kanvas, bukan struktur.
 */
export function useStructureShortcuts(): void {
  // Fase 1.5: TIDAK subscribe ke s.project — hook ini tidak me-render apa
  // pun, cuma memasang satu window listener. Subscribe ke project di sini
  // berarti effect di bawah (dan listener-nya) di-teardown+pasang ulang
  // tiap keystroke (project berubah tiap commit), padahal edges cuma
  // dibaca SAAT tombol Enter benar-benar ditekan. Baca state terkini via
  // getState() di dalam handler.
  const addNode = useProjectStore(s => s.addNode);
  const duplicateNode = useProjectStore(s => s.duplicateNode);
  const requestDelete = useDeleteNodeRequest();
  const undo = useProjectStore(s => s.undo);
  const redo = useProjectStore(s => s.redo);
  const selectedNodeIds = useUiStore(s => s.selectedNodeIds);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isInput =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement)?.isContentEditable;

      if (isInput) return; // Don't intercept typing in inputs

      // Undo / Redo
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }

      // Actions requiring a selected node
      const primarySelected = selectedNodeIds[0];

      if (primarySelected) {
        // Tab: Add Child
        if (e.key === 'Tab') {
          e.preventDefault();
          addNode({ type: 'jabatan', parentId: primarySelected });
          return;
        }

        // Enter: Add Sibling
        if (e.key === 'Enter') {
          e.preventDefault();
          const edges = useProjectStore.getState().project?.edges ?? [];
          const parentEdge = hierarchyEdges(edges).find(eg => eg.target === primarySelected);
          const parentId = parentEdge?.source;
          addNode({ type: 'jabatan', parentId });
          return;
        }

        // Ctrl+D: Duplicate Node
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd' && !e.shiftKey) {
          e.preventDefault();
          duplicateNode(primarySelected, 'node-only');
          return;
        }

        // Ctrl+Shift+D: Duplicate Subtree
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd' && e.shiftKey) {
          e.preventDefault();
          duplicateNode(primarySelected, 'subtree');
          return;
        }

        // Delete / Backspace
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          requestDelete(primarySelected);
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNodeIds, addNode, duplicateNode, requestDelete, undo, redo]);
}
