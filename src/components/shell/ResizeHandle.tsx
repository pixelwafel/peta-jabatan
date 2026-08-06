import React, { useCallback, useRef } from 'react';

interface ResizeHandleProps {
  /** Tepi mana handle ini menempel pada panel induknya (butuh `relative` di induk). */
  side: 'left' | 'right';
  onDrag: (clientX: number) => void;
}

/**
 * Strip tipis di tepi panel yang bisa ditarik mouse untuk mengubah lebar
 * (permintaan pengguna: panel 3 kolom dibuat interaktif/bisa diatur
 * ukurannya). `onDrag` menerima clientX absolut tiap mousemove — konsumen
 * (usePanelWidths) yang menghitung lebar akhir: dari tepi kiri viewport
 * untuk panel kiri, dari tepi kanan viewport untuk panel kanan.
 */
export const ResizeHandle: React.FC<ResizeHandleProps> = ({ side, onDrag }) => {
  const draggingRef = useRef(false);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      draggingRef.current = true;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const handleMouseMove = (ev: MouseEvent) => {
        if (!draggingRef.current) return;
        onDrag(ev.clientX);
      };
      const handleMouseUp = () => {
        draggingRef.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [onDrag]
  );

  return (
    <div
      onMouseDown={handleMouseDown}
      role="separator"
      aria-orientation="vertical"
      title="Tarik untuk mengubah ukuran panel"
      className={`absolute top-0 ${side === 'right' ? 'right-0' : 'left-0'} h-full w-1.5 cursor-col-resize z-10 hover:bg-blue-500/50 active:bg-blue-500/70 transition-colors`}
      style={side === 'right' ? { marginRight: '-3px' } : { marginLeft: '-3px' }}
    />
  );
};
