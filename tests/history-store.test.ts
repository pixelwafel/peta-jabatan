import { describe, it, expect, beforeEach } from 'vitest';
import { useProjectStore } from '../src/store/projectStore';
import { useHistoryStore } from '../src/store/historyStore';
import { useUiStore } from '../src/store/uiStore';
import { Project } from '../src/models/project';

describe('History & State Store (Doc 03 Exit Criteria)', () => {
  const initialProject: Project = {
    id: 'proj-test',
    schemaVersion: '1.0.0',
    configVersion: '2026.1',
    meta: { namaOPD: 'Dinas Kominfo', kodeOPD: 'DISKOMINFO', penyusun: 'Admin' },
    attributeSchema: [],
    nodes: [
      {
        id: 'node-1',
        type: 'unit',
        nama: 'Kepala Dinas',
        nomor: '1',
        rumpun: [],
        rincian: [],
        custom: {},
        position: { x: 0, y: 0 },
        collapsed: false,
      },
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    useProjectStore.getState().setProject(structuredClone(initialProject));
  });

  it('dragging a node multiple times in one session (same txId) produces exactly 1 history entry', () => {
    const txId = 'drag-session-1';

    // Simulate 10 drag position updates during a single drag gesture
    for (let i = 1; i <= 10; i++) {
      useProjectStore.getState().moveNodes([{ id: 'node-1', position: { x: i * 10, y: i * 10 } }], txId);
    }

    // Close transaction (e.g. onNodeDragStop)
    useHistoryStore.getState().closePending();

    const { past } = useHistoryStore.getState();
    expect(past.length).toBe(1);
    expect(past[0].label).toBe('Pindahkan node');

    // Final position should be (100, 100)
    expect(useProjectStore.getState().project?.nodes[0].position).toEqual({ x: 100, y: 100 });
  });

  it('Ctrl+Z immediately after a coalesced drag reverts to initial position', () => {
    const txId = 'drag-session-2';
    useProjectStore.getState().moveNodes([{ id: 'node-1', position: { x: 50, y: 50 } }], txId);
    useProjectStore.getState().moveNodes([{ id: 'node-1', position: { x: 150, y: 150 } }], txId);

    // Undo immediately (undo implicitly closes pending transaction first)
    const success = useProjectStore.getState().undo();
    expect(success).toBe(true);

    // Reverted back to initial position (0, 0)
    expect(useProjectStore.getState().project?.nodes[0].position).toEqual({ x: 0, y: 0 });
  });

  it('Redo after a coalesced drag restores final position, not intermediate', () => {
    const txId = 'drag-session-3';
    useProjectStore.getState().moveNodes([{ id: 'node-1', position: { x: 50, y: 50 } }], txId);
    useProjectStore.getState().moveNodes([{ id: 'node-1', position: { x: 200, y: 200 } }], txId);

    useProjectStore.getState().undo();
    expect(useProjectStore.getState().project?.nodes[0].position).toEqual({ x: 0, y: 0 });

    useProjectStore.getState().redo();
    // Must restore final position (200, 200)
    expect(useProjectStore.getState().project?.nodes[0].position).toEqual({ x: 200, y: 200 });
  });

  it('no-op commits produce 0 history entries (clicking without editing)', () => {
    // Attempt to update node with identical values
    useProjectStore.getState().updateNode('node-1', { nama: 'Kepala Dinas' });

    expect(useHistoryStore.getState().past.length).toBe(0);
  });

  it('selection changes in uiStore produce 0 history entries', () => {
    useUiStore.getState().selectNodes(['node-1']);
    useUiStore.getState().toggleNodeSelection('node-1');

    expect(useHistoryStore.getState().past.length).toBe(0);
    expect(useUiStore.getState().selectedNodeIds).toEqual([]);
  });

  it('switching projects clears history', () => {
    useProjectStore.getState().updateNode('node-1', { nama: 'Kepala Baru' });
    expect(useHistoryStore.getState().past.length).toBe(1);

    // Switch project
    useProjectStore.getState().setProject(structuredClone(initialProject));

    expect(useHistoryStore.getState().past.length).toBe(0);
    expect(useHistoryStore.getState().future.length).toBe(0);
  });

  it('50-step ceiling is enforced (60 distinct edits leave exactly 50 entries)', () => {
    for (let i = 1; i <= 60; i++) {
      useProjectStore.getState().updateNode('node-1', { nama: `Nama ${i}` });
    }

    expect(useHistoryStore.getState().past.length).toBe(50);
  });
});
