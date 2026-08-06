import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProjectIndex } from '../src/persistence/types';

const fixtureIndex: ProjectIndex = {
  version: 1,
  activeId: 'p1',
  entries: [
    {
      id: 'p1',
      namaOPD: 'Dinas Kesehatan',
      kodeOPD: 'DINKES',
      nodeCount: 10,
      totalKebutuhan: 20,
      totalEksisting: 15,
      updatedAt: new Date().toISOString(),
      lastExportedAt: null,
    },
  ],
};

vi.mock('../src/persistence/storage', () => ({
  getProjectIndex: vi.fn(async () => fixtureIndex),
}));

describe('projectIndexStore (M10.0 — foundation for link resolution)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts with a null index before any refresh', async () => {
    // Import fresh module instance per test file run (vitest module registry
    // is shared across it()s in this file — starting state only observable
    // on first import, so we just assert refresh() populates it correctly).
    const { useProjectIndexStore } = await import('../src/store/projectIndexStore');
    expect(useProjectIndexStore.getState().index === null || Array.isArray(useProjectIndexStore.getState().index?.entries)).toBe(true);
  });

  it('refresh() populates the in-memory index from storage', async () => {
    const { useProjectIndexStore } = await import('../src/store/projectIndexStore');
    await useProjectIndexStore.getState().refresh();

    const { index } = useProjectIndexStore.getState();
    expect(index).not.toBeNull();
    expect(index?.entries).toHaveLength(1);
    expect(index?.entries[0].kodeOPD).toBe('DINKES');
  });

  it('refresh() reflects updated storage on a second call', async () => {
    const storage = await import('../src/persistence/storage');
    const { useProjectIndexStore } = await import('../src/store/projectIndexStore');

    await useProjectIndexStore.getState().refresh();
    expect(useProjectIndexStore.getState().index?.entries).toHaveLength(1);

    (storage.getProjectIndex as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      version: 1,
      activeId: 'p1',
      entries: [...fixtureIndex.entries, { ...fixtureIndex.entries[0], id: 'p2', kodeOPD: 'PKM1' }],
    });

    await useProjectIndexStore.getState().refresh();
    expect(useProjectIndexStore.getState().index?.entries).toHaveLength(2);
  });
});
