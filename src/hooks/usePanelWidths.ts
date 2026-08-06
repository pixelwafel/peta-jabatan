import { useCallback, useEffect, useState } from 'react';

const LS_KEY = 'pjb:v1:panel-widths';
const DEFAULT_LEFT = 260;
const DEFAULT_RIGHT = 380;
const MIN_LEFT = 200;
const MAX_LEFT = 480;
const MIN_RIGHT = 280;
const MAX_RIGHT = 640;

interface StoredWidths {
  left?: number;
  right?: number;
}

function readStored(): StoredWidths {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function persist(widths: StoredWidths): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(widths));
  } catch {
    // Storage tak tersedia (mode privat, kuota penuh, dsb.) — lebar tetap
    // jalan untuk sesi ini, cuma tidak persist ke sesi berikutnya.
  }
}

/**
 * Lebar panel kiri (Daftar OPD) & kanan (Properti) yang bisa ditarik-ulur
 * pengguna lewat ResizeHandle, disimpan ke localStorage supaya persist
 * antar sesi. Panel tengah (Struktur+Kanvas) tidak butuh state sendiri —
 * selalu `1fr` di shell-grid, otomatis mengisi sisa ruang.
 */
export function usePanelWidths() {
  const [leftWidth, setLeftWidthState] = useState(() => readStored().left ?? DEFAULT_LEFT);
  const [rightWidth, setRightWidthState] = useState(() => readStored().right ?? DEFAULT_RIGHT);

  const dragLeftTo = useCallback((clientX: number) => {
    setLeftWidthState(Math.min(MAX_LEFT, Math.max(MIN_LEFT, Math.round(clientX))));
  }, []);

  const dragRightTo = useCallback((clientX: number) => {
    setRightWidthState(
      Math.min(MAX_RIGHT, Math.max(MIN_RIGHT, Math.round(window.innerWidth - clientX)))
    );
  }, []);

  useEffect(() => {
    persist({ left: leftWidth, right: rightWidth });
  }, [leftWidth, rightWidth]);

  return { leftWidth, rightWidth, dragLeftTo, dragRightTo };
}
