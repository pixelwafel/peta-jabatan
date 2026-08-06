export interface VisibleRange {
  startIndex: number;
  endIndex: number; // eksklusif
}

/**
 * Windowing murni untuk daftar baris seragam-tinggi (docs/15-template-instance.md
 * §2/§6 "virtualized grid"). Dipisah dari komponen React (components/instance/
 * InstanceGrid.tsx) supaya matematikanya bisa ditest tanpa DOM/scroll asli.
 */
export function computeVisibleRange(
  scrollTop: number,
  rowHeight: number,
  viewportHeight: number,
  overscan: number,
  totalRows: number
): VisibleRange {
  if (totalRows <= 0 || rowHeight <= 0) return { startIndex: 0, endIndex: 0 };

  const visibleCount = Math.ceil(viewportHeight / rowHeight) + overscan * 2;
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const endIndex = Math.min(totalRows, startIndex + visibleCount);
  return { startIndex, endIndex };
}
