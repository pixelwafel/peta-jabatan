import { create } from 'zustand';
import { Patch } from 'immer';

export interface HistoryEntry {
  label: string;
  forward: Patch[];
  inverse: Patch[];
  txId?: string;
}

export interface PendingTx {
  txId: string;
  label: string;
  forward: Patch[];
  inverse: Patch[];
}

export interface HistoryState {
  past: HistoryEntry[];
  future: HistoryEntry[];
  pending: PendingTx | null;

  record: (entry: HistoryEntry) => void;
  closePending: () => void;
  undo: (applyPatchesFn: (inverse: Patch[]) => void) => boolean;
  redo: (applyPatchesFn: (forward: Patch[]) => void) => boolean;
  clearHistory: () => void;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  past: [],
  future: [],
  pending: null,

  record: (entry: HistoryEntry) => {
    const { pending, past } = get();

    // Coalesce into existing pending transaction if txId matches
    if (entry.txId && pending?.txId === entry.txId) {
      set({
        pending: {
          ...pending,
          // Forward patches accumulate chronologically
          forward: [...pending.forward, ...entry.forward],
          // Inverse patches accumulate in REVERSE order (last-first)
          inverse: [...entry.inverse, ...pending.inverse],
        },
      });
      return;
    }

    // Close any open pending transaction of a different txId
    if (pending) {
      const closed: HistoryEntry = {
        label: pending.label,
        forward: pending.forward,
        inverse: pending.inverse,
      };
      const newPast = [...past, closed].slice(-50);

      if (entry.txId) {
        set({
          past: newPast,
          future: [],
          pending: {
            txId: entry.txId,
            label: entry.label,
            forward: entry.forward,
            inverse: entry.inverse,
          },
        });
      } else {
        set({
          past: [...newPast, entry].slice(-50),
          future: [],
          pending: null,
        });
      }
      return;
    }

    if (entry.txId) {
      set({
        pending: {
          txId: entry.txId,
          label: entry.label,
          forward: entry.forward,
          inverse: entry.inverse,
        },
      });
      return;
    }

    set({
      past: [...past, entry].slice(-50),
      future: [],
    });
  },

  closePending: () => {
    const { pending, past } = get();
    if (!pending) return;

    set({
      past: [
        ...past,
        {
          label: pending.label,
          forward: pending.forward,
          inverse: pending.inverse,
        },
      ].slice(-50),
      future: [],
      pending: null,
    });
  },

  undo: (applyPatchesFn: (inverse: Patch[]) => void) => {
    get().closePending();
    const { past, future } = get();
    const entry = past.at(-1);
    if (!entry) return false;

    applyPatchesFn(entry.inverse);

    set({
      past: past.slice(0, -1),
      future: [entry, ...future],
    });
    return true;
  },

  redo: (applyPatchesFn: (forward: Patch[]) => void) => {
    get().closePending();
    const { past, future } = get();
    const entry = future.at(0);
    if (!entry) return false;

    applyPatchesFn(entry.forward);

    set({
      past: [...past, entry].slice(-50),
      future: future.slice(1),
    });
    return true;
  },

  clearHistory: () => {
    set({ past: [], future: [], pending: null });
  },
}));
