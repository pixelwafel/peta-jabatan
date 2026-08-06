import { Project } from '@/models/project';
import { saveProject, getProjectIndex } from './storage';
import { useUiStore } from '@/store/uiStore';
import { useProjectIndexStore } from '@/store/projectIndexStore';

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingProject: Project | null = null;
let broadcastChannel: BroadcastChannel | null = null;

const SAVE_DEBOUNCE_MS = 500;

export function initBroadcastChannel() {
  if (typeof BroadcastChannel !== 'undefined' && !broadcastChannel) {
    broadcastChannel = new BroadcastChannel('pjb');
    broadcastChannel.onmessage = event => {
      const data = event.data;
      if (data?.type === 'SAVE_PING') {
        const activeProjectId = useUiStore.getState().selectedNodeIds; // check current active project
        // Trigger two-tab conflict warning dialog
        useUiStore.getState().setSaveStatus('error');
        useUiStore.getState().openConfirm({
          title: 'Project ini dibuka di tab lain',
          body: 'Perubahan dari tab ini bisa saling menimpa. Tutup salah satu tab agar data tidak rusak.',
          confirmLabel: 'Mengerti',
          danger: true,
          onConfirm: () => {},
        });
      }
    };
  }
}

async function performSave(project: Project): Promise<void> {
  const ui = useUiStore.getState();
  ui.setSaveStatus('saving');

  try {
    await saveProject(project);
    ui.setSaveStatus('saved', new Date().toISOString());
    void useProjectIndexStore.getState().refresh();

    // Broadcast ping to other tabs (doc 10 amendment)
    if (broadcastChannel) {
      broadcastChannel.postMessage({
        type: 'SAVE_PING',
        projectId: project.id,
        timestamp: Date.now(),
      });
    }
  } catch (err) {
    console.error('Autosave error:', err);
    ui.setSaveStatus('error');
  }
}

export function scheduleSave(project: Project): void {
  pendingProject = project;

  if (saveTimer) {
    clearTimeout(saveTimer);
  }

  saveTimer = setTimeout(() => {
    if (pendingProject) {
      performSave(pendingProject);
      pendingProject = null;
      saveTimer = null;
    }
  }, SAVE_DEBOUNCE_MS);
}

export async function flushSave(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (pendingProject) {
    await performSave(pendingProject);
    pendingProject = null;
  }
}

/**
 * Batalkan (tanpa menyimpan) pending save kalau targetnya adalah `id` ini.
 * Dipakai deleteProjectFlow.ts SEBELUM deleteProjectData: kalau operator
 * mengedit lalu langsung menghapus project yang sama dalam jendela debounce
 * 500ms, timer autosave yang masih tertunda akan menulis ulang body yang
 * baru saja dihapus (menghidupkannya kembali). Beda dari flushSave — di sini
 * memang tidak boleh disimpan.
 */
export function discardPendingSaveFor(id: string): void {
  if (pendingProject?.id !== id) return;
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  pendingProject = null;
}

export function initSaveListeners() {
  initBroadcastChannel();

  if (typeof window !== 'undefined') {
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        flushSave();
      }
    });

    window.addEventListener('beforeunload', event => {
      flushSave();
    });
  }
}
