import { toBlob } from 'html-to-image';
import { useProjectStore } from '@/store/projectStore';

export interface PngExportOptions {
  background: 'white' | 'transparent';
  scale: number;
}

export async function exportPng(
  opts: PngExportOptions = { background: 'white', scale: 2 }
): Promise<Blob> {
  const viewportEl = document.querySelector('.react-flow__viewport') as HTMLElement;
  if (!viewportEl) {
    throw new Error('Canvas viewport element not found');
  }

  // 1. Wait for fonts
  if (typeof document !== 'undefined' && document.fonts) {
    await document.fonts.ready;
  }

  // 2. Temporarily expand all collapsed nodes (transient, leaves no history)
  const project = useProjectStore.getState().project;
  const collapsedNodeIds = project?.nodes.filter(n => n.collapsed).map(n => n.id) ?? [];

  if (collapsedNodeIds.length > 0) {
    for (const id of collapsedNodeIds) {
      useProjectStore.getState().updateNode(id, { collapsed: false });
    }
  }

  try {
    // 3. Render element to blob
    const blob = await toBlob(viewportEl, {
      backgroundColor: opts.background === 'white' ? '#ffffff' : undefined,
      pixelRatio: opts.scale,
      filter: domNode => {
        const el = domNode as HTMLElement;
        if (!el || !el.classList) return true;
        if (
          el.classList.contains('react-flow__minimap') ||
          el.classList.contains('react-flow__controls')
        ) {
          return false;
        }
        return true;
      },
    });

    if (!blob) {
      throw new Error('Failed to generate PNG image');
    }

    return blob;
  } finally {
    // Restore collapsed nodes
    if (collapsedNodeIds.length > 0) {
      for (const id of collapsedNodeIds) {
        useProjectStore.getState().updateNode(id, { collapsed: true });
      }
    }
  }
}
