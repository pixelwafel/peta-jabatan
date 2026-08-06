import { describe, it, expect } from 'vitest';
import { computeVisibleRange } from '../src/utils/virtualization';

describe('computeVisibleRange (M12.7, docs/15-template-instance.md §2/§6)', () => {
  it('returns the full range when total rows fit within one viewport', () => {
    const range = computeVisibleRange(0, 32, 420, 6, 10);
    expect(range.startIndex).toBe(0);
    expect(range.endIndex).toBe(10);
  });

  it('windows a large list at scrollTop=0 with overscan applied only at the end (clamped at start)', () => {
    const range = computeVisibleRange(0, 32, 420, 6, 1000);
    expect(range.startIndex).toBe(0);
    // ceil(420/32) = 14, + 2*6 overscan = 26
    expect(range.endIndex).toBe(26);
  });

  it('shifts the window as scrollTop increases, with overscan on both sides', () => {
    // scrolled to row ~50 (scrollTop = 50*32 = 1600)
    const range = computeVisibleRange(1600, 32, 420, 6, 1000);
    expect(range.startIndex).toBe(50 - 6);
    expect(range.endIndex).toBe(range.startIndex + Math.ceil(420 / 32) + 12);
  });

  it('clamps endIndex to totalRows near the end of the list', () => {
    const range = computeVisibleRange(1600, 32, 420, 6, 60); // scrolled near the end of a 60-row list
    expect(range.endIndex).toBe(60);
    expect(range.endIndex).toBeLessThanOrEqual(60);
  });

  it('returns an empty range for zero rows (no crash on an empty instance list)', () => {
    const range = computeVisibleRange(0, 32, 420, 6, 0);
    expect(range).toEqual({ startIndex: 0, endIndex: 0 });
  });

  it('handles 300 rows (the doc\'s worked example — 300 schools) without overflowing bounds', () => {
    const range = computeVisibleRange(300 * 32, 32, 420, 6, 300); // scroll all the way to the bottom
    expect(range.startIndex).toBeGreaterThanOrEqual(0);
    expect(range.endIndex).toBe(300);
    expect(range.endIndex - range.startIndex).toBeLessThan(300); // masih ter-virtualisasi, bukan render semua
  });
});
