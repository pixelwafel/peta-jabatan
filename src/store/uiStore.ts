import { create } from 'zustand';

export type LeftPanelTab = 'tree' | 'unplaced' | 'recap';
export type SaveStatus = 'saved' | 'saving' | 'error';

export interface ConfirmDialogState {
  kind: 'confirm';
  title: string;
  body: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
}

export type DialogState = ConfirmDialogState | null;

export interface UiState {
  selectedNodeIds: string[];
  showJenjangOnCard: boolean;
  leftPanel: LeftPanelTab;
  dialog: DialogState;
  lastSavedAt: string | null;
  saveStatus: SaveStatus;

  // Actions
  selectNodes: (nodeIds: string[]) => void;
  toggleNodeSelection: (nodeId: string) => void;
  clearSelection: () => void;
  setShowJenjangOnCard: (show: boolean) => void;
  setLeftPanel: (panel: LeftPanelTab) => void;
  setDialog: (dialog: DialogState) => void;
  openConfirm: (opts: Omit<ConfirmDialogState, 'kind'>) => void;
  closeDialog: () => void;
  setSaveStatus: (status: SaveStatus, at?: string) => void;
}

export const useUiStore = create<UiState>(set => ({
  selectedNodeIds: [],
  showJenjangOnCard: false,
  leftPanel: 'tree',
  dialog: null,
  lastSavedAt: null,
  saveStatus: 'saved',

  selectNodes: (nodeIds: string[]) =>
    set(state => {
      const same =
        state.selectedNodeIds.length === nodeIds.length &&
        state.selectedNodeIds.every((id, i) => id === nodeIds[i]);
      return same ? state : { selectedNodeIds: nodeIds };
    }),
  toggleNodeSelection: (nodeId: string) =>
    set(state => ({
      selectedNodeIds: state.selectedNodeIds.includes(nodeId)
        ? state.selectedNodeIds.filter(id => id !== nodeId)
        : [...state.selectedNodeIds, nodeId],
    })),
  clearSelection: () => set({ selectedNodeIds: [] }),
  setShowJenjangOnCard: (show: boolean) => set({ showJenjangOnCard: show }),
  setLeftPanel: (panel: LeftPanelTab) => set({ leftPanel: panel }),
  setDialog: (dialog: DialogState) => set({ dialog }),
  openConfirm: (opts: Omit<ConfirmDialogState, 'kind'>) =>
    set({ dialog: { kind: 'confirm', ...opts } }),
  closeDialog: () => set({ dialog: null }),
  setSaveStatus: (status: SaveStatus, at?: string) =>
    set({ saveStatus: status, ...(at ? { lastSavedAt: at } : {}) }),
}));
