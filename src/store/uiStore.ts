import { create } from 'zustand';

export type StructureTab = 'outline' | 'preview' | 'unplaced' | 'recap' | 'satuan';
export type SaveStatus = 'saved' | 'saving' | 'error';

export interface ConfirmDialogState {
  kind: 'confirm';
  title: string;
  body: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
}

/**
 * Dialog khusus hapus node yang punya anak — beda dari ConfirmDialogState
 * biasa karena butuh 2 aksi destruktif berdampingan (bukan cuma 1 "Lanjutkan"),
 * supaya operator sadar ada 2 pilihan yang konsekuensinya sangat beda:
 * "node ini saja" (anak naik satu tingkat / bisa jadi node terpisah tanpa
 * induk kalau node yang dihapus sendiri tidak berinduk) vs "seluruh isinya"
 * (semua turunan ikut lenyap).
 */
export interface DeleteNodeDialogState {
  kind: 'delete-node';
  nodeName: string;
  directChildCount: number;
  subtreeCount: number; // jumlah turunan (tidak termasuk node itu sendiri)
  /** true kalau node yang dihapus TIDAK berinduk — mode "node ini saja" akan
   * membuat anak-anaknya jadi node terpisah tanpa induk sama sekali. */
  orphanWarning: boolean;
  onDeleteNodeOnly: () => void;
  onDeleteSubtree: () => void;
}

export type DialogState = ConfirmDialogState | DeleteNodeDialogState | null;

export interface ToastState {
  id: string;
  message: string;
  tone: 'success' | 'error';
}

/**
 * Permintaan "fokus ke node ini" dari panel manapun (Outline/Unplaced/Rekap/
 * ReadinessDialog) — TIDAK memanggil setCenter() langsung di panel asal,
 * karena <ReactFlow> cuma benar-benar mounted saat tab Preview aktif
 * (StructurePanel.tsx). Memanggil aksi viewport (setCenter dengan durasi
 * animasi) lewat useReactFlow() saat <ReactFlow>-nya sendiri belum/tidak
 * mounted membuat transisi d3-zoom internal xyflow nyangkut; begitu Preview
 * akhirnya dibuka, StoreUpdater ikut memicu "Maximum update depth exceeded"
 * (loop setNodes tanpa henti). Canvas.tsx (satu-satunya tempat <ReactFlow>
 * benar-benar dirender) yang mengonsumsi permintaan ini lewat efek, setelah
 * dirinya sendiri pasti sudah mounted. `nonce` supaya klik node yang SAMA dua
 * kali berturut-turut tetap memicu efek (nodeId saja tidak berubah referensi).
 */
export interface FocusRequest {
  nodeId: string;
  nonce: number;
}

export interface UiState {
  selectedNodeIds: string[];
  showJenjangOnCard: boolean;
  /** Tab aktif di panel tengah (Outline/Preview/Unplaced/Rekap/Satuan). */
  structureTab: StructureTab;
  focusRequest: FocusRequest | null;
  /** Template unit yang sedang dipilih di tab Satuan (kalau project punya >1 template). */
  selectedTemplateId: string | null;
  dialog: DialogState;
  toast: ToastState | null;
  lastSavedAt: string | null;
  saveStatus: SaveStatus;

  // Actions
  selectNodes: (nodeIds: string[]) => void;
  toggleNodeSelection: (nodeId: string) => void;
  clearSelection: () => void;
  setShowJenjangOnCard: (show: boolean) => void;
  setStructureTab: (tab: StructureTab) => void;
  setSelectedTemplateId: (id: string | null) => void;
  /** Minta Canvas men-setCenter node ini begitu Canvas (tab Preview) benar-
   * benar mounted — TIDAK memaksa pindah tab. Kalau operator sudah di
   * Preview, efeknya langsung terlihat; kalau belum, permintaan menunggu
   * sampai operator membuka tab Preview sendiri. Lihat komentar FocusRequest
   * di atas untuk alasan kenapa TIDAK boleh setCenter langsung dari sini. */
  requestFocusNode: (nodeId: string) => void;
  clearFocusRequest: () => void;
  /** Dipanggil dari panel properti (TemplateEditor) — pindah ke tab Satuan
   * langsung menunjuk template yang bersangkutan, tanpa operator harus
   * mencari-cari tab lalu memilih ulang dari dropdown. */
  openSatuanTab: (templateNodeId: string) => void;
  setDialog: (dialog: DialogState) => void;
  openConfirm: (opts: Omit<ConfirmDialogState, 'kind'>) => void;
  openDeleteNodeDialog: (opts: Omit<DeleteNodeDialogState, 'kind'>) => void;
  closeDialog: () => void;
  showToast: (message: string, tone?: 'success' | 'error') => void;
  clearToast: () => void;
  setSaveStatus: (status: SaveStatus, at?: string) => void;
}

export const useUiStore = create<UiState>(set => ({
  selectedNodeIds: [],
  showJenjangOnCard: false,
  structureTab: 'outline',
  focusRequest: null,
  selectedTemplateId: null,
  dialog: null,
  toast: null,
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
  setStructureTab: (tab: StructureTab) => set({ structureTab: tab }),
  setSelectedTemplateId: (id: string | null) => set({ selectedTemplateId: id }),
  requestFocusNode: (nodeId: string) =>
    set(state => ({
      focusRequest: { nodeId, nonce: (state.focusRequest?.nonce ?? 0) + 1 },
    })),
  clearFocusRequest: () => set({ focusRequest: null }),
  openSatuanTab: (templateNodeId: string) =>
    set({ structureTab: 'satuan', selectedTemplateId: templateNodeId }),
  setDialog: (dialog: DialogState) => set({ dialog }),
  openConfirm: (opts: Omit<ConfirmDialogState, 'kind'>) =>
    set({ dialog: { kind: 'confirm', ...opts } }),
  openDeleteNodeDialog: (opts: Omit<DeleteNodeDialogState, 'kind'>) =>
    set({ dialog: { kind: 'delete-node', ...opts } }),
  closeDialog: () => set({ dialog: null }),
  showToast: (message: string, tone: 'success' | 'error' = 'success') =>
    set({ toast: { id: `${Date.now()}-${Math.random()}`, message, tone } }),
  clearToast: () => set({ toast: null }),
  setSaveStatus: (status: SaveStatus, at?: string) =>
    set({ saveStatus: status, ...(at ? { lastSavedAt: at } : {}) }),
}));
