/**
 * Numbering utilities for hierarchical 'nomor' strings (e.g., '1.2.10').
 */

export function parseNomor(s: string): number[] | null {
  if (!s || typeof s !== 'string') return null;
  const trimmed = s.trim();
  if (!trimmed) return null;

  const parts = trimmed.split('.');
  const segs: number[] = [];

  for (const p of parts) {
    if (!/^\d+$/.test(p)) return null;
    const num = parseInt(p, 10);
    if (isNaN(num)) return null;
    segs.push(num);
  }

  return segs.length > 0 ? segs : null;
}

export function formatNomor(seg: number[]): string {
  if (!seg || seg.length === 0) return '';
  return seg.join('.');
}

export function parentNomor(s: string): string | null {
  const parsed = parseNomor(s);
  if (!parsed || parsed.length <= 1) return null;
  return formatNomor(parsed.slice(0, -1));
}

export function segmentCount(s: string): number {
  const parsed = parseNomor(s);
  return parsed ? parsed.length : 0;
}

/**
 * Segment-wise numeric comparison, NOT lexical.
 * '1.10' sorts AFTER '1.9'.
 */
export function compareNomor(a: string, b: string): number {
  const A = parseNomor(a) ?? [];
  const B = parseNomor(b) ?? [];

  const maxLen = Math.max(A.length, B.length);
  for (let i = 0; i < maxLen; i++) {
    const segA = A[i] ?? -1;
    const segB = B[i] ?? -1;
    const diff = segA - segB;
    if (diff !== 0) return diff;
  }

  return 0;
}
