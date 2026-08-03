import { getProjectIndex, getProject, saveProject } from './storage';
import { useProjectStore } from '@/store/projectStore';
import { scheduleSave, initSaveListeners } from './autosave';
import { uuid } from '@/utils/uuid';
import { Project } from '@/models/project';

let initialized = false;

export async function bootstrapPersistence(): Promise<void> {
  if (initialized) return;
  initialized = true;

  initSaveListeners();

  try {
    const index = await getProjectIndex();

    if (!index.activeId || index.entries.length === 0) {
      // Create initial default project if no project exists yet
      const defaultId = uuid();
      const defaultProject: Project = {
        id: defaultId,
        schemaVersion: '1.0.0',
        configVersion: '2026.1',
        meta: {
          namaOPD: 'Dinas Sekretariat Daerah',
          kodeOPD: 'SETDA.01',
          penyusun: 'Administrator',
          tahunAnggaran: '2027',
        },
        attributeSchema: [],
        nodes: [
          {
            id: uuid(),
            type: 'unit',
            nama: 'Dinas Sekretariat Daerah',
            nomor: '1',
            rumpun: [],
            rincian: [],
            custom: {},
            position: { x: 250, y: 50 },
            collapsed: false,
          },
        ],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await saveProject(defaultProject);
      useProjectStore.getState().setProject(defaultProject);
    } else {
      const activeProject = await getProject(index.activeId);
      if (activeProject) {
        useProjectStore.getState().setProject(activeProject);
      } else {
        // Fallback if body corrupted: pick first available entry
        const fallbackId = index.entries[0]?.id;
        if (fallbackId) {
          const fallbackProj = await getProject(fallbackId);
          if (fallbackProj) {
            useProjectStore.getState().setProject(fallbackProj);
          }
        }
      }
    }
  } catch (err) {
    console.error('Bootstrap persistence error:', err);
  }

  // Subscribe projectStore changes to scheduleSave
  useProjectStore.subscribe((state, prevState) => {
    if (state.project && state.project !== prevState.project) {
      scheduleSave(state.project);
    }
  });
}
