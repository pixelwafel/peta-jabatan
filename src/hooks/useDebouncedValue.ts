import { useEffect, useState } from 'react';

/**
 * Fase 1.7 — nilai ter-debounce untuk input pencarian. Dipakai supaya
 * input TETAP responsif (value langsung dari state lokal komponen), tapi
 * komputasi yang MAHAL (filter/scan) di belakangnya baru jalan setelah
 * operator berhenti mengetik sejenak, bukan tiap karakter.
 */
export function useDebouncedValue<T>(value: T, delayMs = 150): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
