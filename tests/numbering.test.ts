import { describe, it, expect } from 'vitest';
import { parseNomor, formatNomor, parentNomor, compareNomor } from '../src/utils/numbering';

describe('Numbering Utilities', () => {
  it('parseNomor parses valid hierarchical numbers', () => {
    expect(parseNomor('1.2.10')).toEqual([1, 2, 10]);
    expect(parseNomor('1')).toEqual([1]);
    expect(parseNomor('1.0.5')).toEqual([1, 0, 5]);
    expect(parseNomor('invalid')).toBeNull();
    expect(parseNomor('')).toBeNull();
  });

  it('formatNomor formats number arrays to string', () => {
    expect(formatNomor([1, 2, 10])).toBe('1.2.10');
    expect(formatNomor([1])).toBe('1');
    expect(formatNomor([])).toBe('');
  });

  it('parentNomor derives parent number string', () => {
    expect(parentNomor('1.2.10')).toBe('1.2');
    expect(parentNomor('1.2')).toBe('1');
    expect(parentNomor('1')).toBeNull();
  });

  it('compareNomor performs segment-wise numeric sorting (1.10 sorts after 1.9)', () => {
    // Crucial requirement: 1.10 must sort AFTER 1.9, not before lexical comparison!
    expect(compareNomor('1.10', '1.9')).toBeGreaterThan(0);
    expect(compareNomor('1.9', '1.10')).toBeLessThan(0);
    expect(compareNomor('1.2', '1.10')).toBeLessThan(0);
    expect(compareNomor('1.2.1', '1.2.2')).toBeLessThan(0);
    expect(compareNomor('1.2', '1.2')).toBe(0);
    expect(compareNomor('1.2.1', '1.2')).toBeGreaterThan(0);
  });
});
