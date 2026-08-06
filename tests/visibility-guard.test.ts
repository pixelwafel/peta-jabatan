import { describe, it, expect } from 'vitest';
import { guardVisibleByDepth } from '../src/selectors/visibility';

// Fase 2.6 — dasar pagar pengaman React Flow (Canvas.tsx): kalau visible
// melebihi ambang, potong per-kedalaman alih-alih mengubah node.collapsed
// (yang persisten/undo-tracked).

describe('guardVisibleByDepth (Fase 2.6)', () => {
  it('is a no-op (same Set reference, cutoffDepth null) when under the limit', () => {
    const visible = new Set(['a', 'b', 'c']);
    const depths = new Map([['a', 0], ['b', 1], ['c', 1]]);
    const result = guardVisibleByDepth(visible, depths, 10);

    expect(result.guardedVisible).toBe(visible);
    expect(result.cutoffDepth).toBeNull();
    expect(result.hiddenCount).toBe(0);
  });

  it('cuts at the deepest level whose cumulative count still fits the limit', () => {
    // depth 0: 1 node, depth 1: 2 node, depth 2: 5 node -> total 8, limit 3
    // -> kumulatif 0..1 = 3 (pas), menambah depth 2 akan jadi 8 > 3 -> cutoff di depth 1.
    const visible = new Set(['root', 'a', 'b', 'a1', 'a2', 'a3', 'b1', 'b2']);
    const depths = new Map<string, number>([
      ['root', 0],
      ['a', 1],
      ['b', 1],
      ['a1', 2],
      ['a2', 2],
      ['a3', 2],
      ['b1', 2],
      ['b2', 2],
    ]);
    const result = guardVisibleByDepth(visible, depths, 3);

    expect(result.cutoffDepth).toBe(1);
    expect(result.guardedVisible).toEqual(new Set(['root', 'a', 'b']));
    expect(result.hiddenCount).toBe(5);
  });

  it('always keeps depth 0 even when the limit is smaller than the root population', () => {
    const visible = new Set(['root1', 'root2', 'root3', 'child']);
    const depths = new Map<string, number>([
      ['root1', 0],
      ['root2', 0],
      ['root3', 0],
      ['child', 1],
    ]);
    const result = guardVisibleByDepth(visible, depths, 1);

    expect(result.cutoffDepth).toBe(0);
    expect(result.guardedVisible).toEqual(new Set(['root1', 'root2', 'root3']));
  });

  it('an empty visible set stays a no-op', () => {
    const result = guardVisibleByDepth(new Set(), new Map(), 100);
    expect(result.cutoffDepth).toBeNull();
    expect(result.guardedVisible.size).toBe(0);
  });
});
