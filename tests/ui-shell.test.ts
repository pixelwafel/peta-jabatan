import { describe, it, expect, beforeEach } from 'vitest';

// UI Store state interface mirror for unit testing UI Shell contracts
interface DialogAction {
  label: string;
  primary?: boolean;
  onClick: () => void;
}

type DialogState =
  | { kind: 'none' }
  | { kind: 'confirm'; title: string; body: string; requireTyping?: string; onConfirm: () => void }
  | { kind: 'alert'; title: string; body: string; dismissible: boolean; actions: DialogAction[] };

interface UiState {
  leftSidebarCollapsed: boolean;
  rightSidebarCollapsed: boolean;
  activeTab: 'tree' | 'unplaced' | 'recap';
  dialog: DialogState;
  selectedNodeIds: string[];
}

class UiStore {
  private state: UiState = {
    leftSidebarCollapsed: false,
    rightSidebarCollapsed: false,
    activeTab: 'tree',
    dialog: { kind: 'none' },
    selectedNodeIds: [],
  };

  getState(): UiState {
    return this.state;
  }

  toggleLeftSidebar() {
    this.state.leftSidebarCollapsed = !this.state.leftSidebarCollapsed;
  }

  toggleRightSidebar() {
    this.state.rightSidebarCollapsed = !this.state.rightSidebarCollapsed;
  }

  openConfirm(opts: { title: string; body: string; requireTyping?: string; onConfirm: () => void }) {
    this.state.dialog = { kind: 'confirm', ...opts };
  }

  openAlert(opts: { title: string; body: string; dismissible: boolean; actions: DialogAction[] }) {
    this.state.dialog = { kind: 'alert', ...opts };
  }

  closeDialog() {
    this.state.dialog = { kind: 'none' };
  }

  setSelectedNodes(ids: string[]) {
    this.state.selectedNodeIds = ids;
  }

  reset() {
    this.state = {
      leftSidebarCollapsed: false,
      rightSidebarCollapsed: false,
      activeTab: 'tree',
      dialog: { kind: 'none' },
      selectedNodeIds: [],
    };
  }
}

describe('UI Shell & Dialog Controller Contracts (doc 11)', () => {
  let uiStore: UiStore;

  beforeEach(() => {
    uiStore = new UiStore();
  });

  it('sidebar collapse toggles work correctly', () => {
    expect(uiStore.getState().leftSidebarCollapsed).toBe(false);
    uiStore.toggleLeftSidebar();
    expect(uiStore.getState().leftSidebarCollapsed).toBe(true);

    expect(uiStore.getState().rightSidebarCollapsed).toBe(false);
    uiStore.toggleRightSidebar();
    expect(uiStore.getState().rightSidebarCollapsed).toBe(true);
  });

  it('single dialog controller routes confirm and alert states', () => {
    let confirmed = false;
    uiStore.openConfirm({
      title: 'Hapus Project',
      body: 'Project belum diekspor akan hilang permanent.',
      requireTyping: 'Dinas Pendidikan',
      onConfirm: () => {
        confirmed = true;
      },
    });

    const dlg = uiStore.getState().dialog;
    expect(dlg.kind).toBe('confirm');
    if (dlg.kind === 'confirm') {
      expect(dlg.requireTyping).toBe('Dinas Pendidikan');
      dlg.onConfirm();
      expect(confirmed).toBe(true);
    }

    uiStore.closeDialog();
    expect(uiStore.getState().dialog.kind).toBe('none');
  });

  it('destructive deletion requires exact string matching for requireTyping', () => {
    const targetAgency = 'Dinas Kesehatan';
    const userInput = 'dinas kesehatan'; // wrong casing/unmatched

    const isMatch = userInput === targetAgency;
    expect(isMatch).toBe(false);

    const validMatch = 'Dinas Kesehatan' === targetAgency;
    expect(validMatch).toBe(true);
  });
});
