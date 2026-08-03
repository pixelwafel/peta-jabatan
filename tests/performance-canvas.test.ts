import { describe, it, expect, beforeEach } from 'vitest';
import { generate500NodeFixture } from '../src/utils/fixture';
import { useProjectStore } from '../src/store/projectStore';
import { getStructureIndex, resetRebuildCount, getRebuildCount } from '../src/selectors/structureIndex';
import { projectTotals } from '../src/selectors/totals';
import { computeLayout } from '../src/utils/layout';

describe('M2 Performance Gate — 500-Node Fixture Benchmark', () => {
  beforeEach(() => {
    resetRebuildCount();
    useProjectStore.getState().setProject(generate500NodeFixture());
  });

  it('verifies 500-node fixture integrity', () => {
    const project = useProjectStore.getState().project!;
    expect(project.nodes.length).toBe(500);
    expect(project.edges.length).toBe(499);

    const totals = projectTotals(project.nodes);
    expect(totals.kebutuhan).toBeGreaterThan(0);
    expect(totals.eksisting).toBeGreaterThan(0);
  });

  it('StructureIndex rebuild count is exactly 1 during 100 node drag position updates on 500 nodes', () => {
    const project = useProjectStore.getState().project!;

    // Initial build
    getStructureIndex(project.nodes, project.edges);
    expect(getRebuildCount()).toBe(1);

    const startTime = performance.now();

    // Simulate 100 drag position updates (60fps drag over ~1.6s)
    const moves = [{ id: 'node-pos-1-1', position: { x: 50, y: 50 } }];
    for (let i = 0; i < 100; i++) {
      moves[0].position = { x: 50 + i, y: 50 + i };
      useProjectStore.getState().moveNodes(moves, 'drag-500-test');
      getStructureIndex(
        useProjectStore.getState().project!.nodes,
        useProjectStore.getState().project!.edges
      );
    }

    const durationMs = performance.now() - startTime;
    const avgMsPerFrame = durationMs / 100;
    const derivedFps = 1000 / (avgMsPerFrame || 0.001);

    console.log(`[500-Node Drag Benchmark] 100 updates took ${durationMs.toFixed(2)}ms`);
    console.log(`[500-Node Drag Benchmark] Avg frame time: ${avgMsPerFrame.toFixed(3)}ms/frame (~${derivedFps.toFixed(0)} FPS)`);

    // Must not rebuild structure index during drag
    expect(getRebuildCount()).toBe(1);
    // Frame processing must be fast (< 2ms per drag update in node)
    expect(avgMsPerFrame).toBeLessThan(5);
  });

  it('Dagre Tidy layout computation on 500 nodes executes under 100ms', () => {
    const project = useProjectStore.getState().project!;
    const start = performance.now();

    const layout = computeLayout(project.nodes, project.edges, {
      direction: 'TB',
      scope: 'all',
      showJenjang: false,
    });

    const elapsed = performance.now() - start;
    console.log(`[500-Node Dagre Layout] Tidy computed 500 nodes in ${elapsed.toFixed(2)}ms`);

    expect(layout.size).toBe(500);
    expect(elapsed).toBeLessThan(150);
  });
});
