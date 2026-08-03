# 03 — State & History

## Purpose

One mutable source of truth, one path for every mutation, and 50-step undo/redo
that does not cost megabytes or drop frames during a drag.

---

## 1. Store shape

Three stores, separated by lifetime rather than by feature.

```ts
// store/project.ts — persisted, undoable
interface ProjectState {
  project: Project | null;
  // actions in §3
}

// store/history.ts — session-only, not persisted
interface HistoryState {
  past: HistoryEntry[];        // max 50
  future: HistoryEntry[];
  pending: PendingTx | null;   // open coalescing transaction
}

// store/ui.ts — session-only, not undoable
interface UiState {
  selectedNodeIds: string[];
  showJenjangOnCard: boolean;
  leftPanel: 'tree' | 'unplaced' | 'recap';
  dialog: DialogState | null;
  lastSavedAt: string | null;
  saveStatus: 'saved' | 'saving' | 'error';
}
```

**Selection lives in `ui`, not `project`.** Selection is not part of the document
and must not be undoable — an undo that changes what is selected feels broken.
This also keeps selection changes from invalidating the structure index.

---

## 2. History: patches, not snapshots

Snapshotting `nodes + edges` is the obvious approach and the wrong one here. A
500-node project serializes to roughly 200–400 KB; fifty snapshots is 10–20 MB
held live, plus a full structural clone on every keystroke.

Immer's `produceWithPatches` gives forward and inverse patches for the actual
delta. Typing a character produces two tiny patches.

```ts
import { produceWithPatches, enablePatches, applyPatches } from 'immer';
enablePatches();

interface HistoryEntry {
  label: string;               // shown in tooltips: 'Ubah nama', 'Rapikan'
  forward: Patch[];
  inverse: Patch[];
  txId?: string;               // coalescing group
}
```

### The single mutation entry point

Every write goes through `commit`. Nothing mutates `project` directly.

```ts
function commit(label: string, recipe: (draft: Project) => void, opts?: {
  txId?: string;               // coalesce with an open transaction of same id
  transient?: boolean;         // apply without recording history
}) {
  const current = get().project;
  if (!current) return;

  const [next, forward, inverse] = produceWithPatches(current, draft => {
    recipe(draft);
    draft.updatedAt = new Date().toISOString();
  });

  if (forward.length === 0) return;            // no-op, don't pollute history
  set({ project: next });

  if (opts?.transient) return;
  history.record({ label, forward, inverse, txId: opts?.txId });
  persistence.scheduleSave(next);
}
```

Three properties worth noting. The **empty-patch guard** means a "change" that
changes nothing never appears in history — clicking into a field and out again
should not consume an undo step. The **`updatedAt` write inside the recipe** means
it is part of the patch and travels with undo. And `transient` exists for exactly
one case, covered next.

### Coalescing: drag and typing

A canvas drag fires position updates at frame rate. Recording each would exhaust
50 steps in under a second.

```ts
// Both forward and inverse are accumulated symmetrically so that both undo
// and redo work correctly on coalesced transactions.
interface PendingTx { txId: string; label: string; forward: Patch[]; inverse: Patch[] }

function record(entry: HistoryEntry) {
  const { pending, past } = get();

  if (entry.txId && pending?.txId === entry.txId) {
    // Extend the open transaction.
    //   forward patches append  (chronological order  — first applied first on redo)
    //   inverse patches prepend (reverse-chronological — last change undone first on undo)
    set({
      pending: {
        ...pending,
        forward: [...pending.forward, ...entry.forward],
        inverse: [...entry.inverse, ...pending.inverse],
      },
    });
    return;
  }

  if (pending) closePending();

  if (entry.txId) {
    set({ pending: { txId: entry.txId, label: entry.label, forward: entry.forward, inverse: entry.inverse } });
    return;
  }

  set({ past: [...past, entry].slice(-50), future: [] });
}

function closePending() {
  const { pending, past } = get();
  if (!pending) return;
  set({
    past: [
      ...past,
      { label: pending.label, forward: pending.forward, inverse: pending.inverse },
    ].slice(-50),
    future: [],
    pending: null,
  });
}
```

The inverse-order detail is the one that produces a subtle bug if missed: patches
must be applied in reverse chronological order, so each new inverse batch is
**prepended**. Forward patches are the mirror: appended in chronological order,
applied first-to-last on redo.

Both directions accumulate from the start of the transaction. Reconstructing
forwards from accumulated inverses is theoretically possible but error-prone;
carrying them explicitly is cheap (drag position patches are tiny) and keeps redo
correct at zero implementation risk.

**Transaction boundaries:**

| Interaction | txId | Closed by |
|---|---|---|
| Node drag | `drag:${sessionId}` | `onNodeDragStop` |
| Text field typing | `field:${nodeId}:${field}` | blur, or 600 ms idle |
| Number stepper | `num:${rincianId}:${field}` | blur, or 600 ms idle |
| Multi-select drag | `drag:${sessionId}` | `onNodeDragStop` |
| Tidy, parent change, add, delete | none | immediate |

Idle-closing typing at 600 ms means a pause mid-sentence creates an undo
boundary. That matches what people expect from an editor.

### Undo / redo

```ts
function undo() {
  closePending();                              // an open drag is undoable immediately
  const { past, future } = get();
  const entry = past.at(-1);
  if (!entry) return;

  const restored = applyPatches(project, entry.inverse);
  set({ project: restored, past: past.slice(0, -1), future: [entry, ...future] });
  persistence.scheduleSave(restored);
}
```

`closePending()` first is what makes "drag then immediately Ctrl+Z" work. Without
it the drag sits in `pending`, `past` is unchanged, and undo appears to skip a
step.

**History is cleared** on project switch, import, and new project. Cross-document
undo is meaningless and dangerous.

---

## 3. Project actions

Each is a thin `commit` wrapper. Signatures are the contract other modules use.

### Node lifecycle

```ts
addNode(input: {
  type: NodeType;
  nama?: string;
  parentId?: string;
  position?: { x: number; y: number };
}): string                                   // returns new node id
```

```ts
function addNode({ type, nama, parentId, position }) {
  const id = uuid();
  commit('Tambah node', draft => {
    draft.nodes.push({
      id, type,
      nama: nama ?? (type === 'unit' ? 'Unit Baru' : 'Jabatan Baru'),
      nomor: '',                             // assigned by renumber, not guessed
      rumpun: [],
      // INVARIANT 1 & 2: units get no rows, positions get exactly one
      rincian: type === 'unit' ? [] : [{ id: uuid(), jenjangId: null, kebutuhan: 0, eksisting: 0 }],
      custom: {},
      position: position ?? placeBelowParent(parentId),
      collapsed: false,
    });
    if (parentId) draft.edges.push({ id: uuid(), source: parentId, target: id, kind: 'hirarki' });
  });
  ui.select([id]);
  return id;
}
```

`nomor: ''` rather than a guess. A guessed number that collides with a real one is
worse than a blank flagged by the readiness check.

`placeBelowParent` offsets from the parent and nudges right until no overlap, so
keyboard-added nodes don't stack invisibly.

```ts
updateNode(id: string, patch: Partial<OrgNode>, txId?: string): void
deleteNode(id: string, mode: 'node-only' | 'subtree'): void
duplicateNode(id: string, mode: 'node-only' | 'subtree'): string
setNodeType(id: string, type: NodeType): void
```

`deleteNode` with `'node-only'` reattaches orphaned children to the deleted node's
parent. If there is no parent they become unplaced — visible in the panel, not
lost. The confirmation dialog states the child count, from `canDelete()`.

`setNodeType` to `'unit'` must discard `rincian` (invariant 1) and warn if figures
are non-zero. To `'jabatan'`, seed one empty row.

`duplicateNode` with `'subtree'` needs a full id remap:

```ts
function duplicateSubtree(rootId) {
  const originals = subtreeOf(rootId);
  const idMap = new Map(originals.map(n => [n.id, uuid()]));
  commit('Duplikat subtree', draft => {
    for (const n of originals) {
      draft.nodes.push({
        ...structuredClone(n),
        id: idMap.get(n.id)!,
        nomor: '',                                  // duplicated numbers would collide
        rincian: n.rincian.map(r => ({ ...r, id: uuid() })),
        position: { x: n.position.x + 40, y: n.position.y + 40 },
      });
    }
    // Internal edges remapped; the edge from the original parent is NOT copied —
    // the copy starts unplaced so the operator decides where it belongs.
    for (const e of hierarchyEdges(draft.edges)) {
      if (idMap.has(e.source) && idMap.has(e.target)) {
        draft.edges.push({ id: uuid(), source: idMap.get(e.source)!, target: idMap.get(e.target)!, kind: 'hirarki' });
      }
    }
  });
}
```

Two deliberate choices: `rincian` ids are regenerated (they are keys, not data),
and the copy is left unplaced rather than becoming a sibling. A duplicated
division silently appearing under the same parent is rarely what was meant.

### Hierarchy

```ts
setParent(childId: string, parentId: string | null): void
```

```ts
function setParent(childId, parentId) {
  if (parentId && !canSetParent(childId, parentId)) return;   // cycle guard, doc 04
  commit('Ubah parent', draft => {
    draft.edges = draft.edges.filter(
      e => !(e.kind === 'hirarki' && e.target === childId)     // invariant 5
    );
    if (parentId) draft.edges.push({ id: uuid(), source: parentId, target: childId, kind: 'hirarki' });
  });
}
```

Filter-then-add, never add-then-clean. The intermediate state with two parents
would be briefly visible to any subscriber.

**`setParent` does not move the node.** Position is untouched — invariant 2. The
operator runs Tidy if they want the geometry to follow.

### Detail rows

```ts
addRincian(nodeId: string, jenjangId: string | null): void
updateRincian(nodeId: string, rincianId: string, patch: Partial<Rincian>, txId?: string): void
removeRincian(nodeId: string, rincianId: string): void
setRumpun(nodeId: string, rumpun: Rumpun[]): void      // may cascade row removal
setKategori(nodeId: string, kategoriId: string): void  // nulls invalid jenjangId
```

`setKategori` implements doc 02 §5: rows and figures survive, `jenjangId` is
nulled, a `JENJANG_RESET` finding is emitted.

### Position

```ts
moveNodes(moves: Array<{ id: string; position: { x: number; y: number } }>, txId: string): void
applyLayout(positions: Map<string, { x: number; y: number }>, scope: 'all' | 'subtree'): void
```

`moveNodes` always carries a txId — it is only ever called from drag. `applyLayout`
never does; Tidy is one atomic undo step.

### Project-level

```ts
setMeta(patch: Partial<ProjectMeta>): void
addCustomAttribute(attr: CustomAttribute): void
removeCustomAttribute(attrId: string): void     // strips values from all nodes
renumberFromStructure(): void                   // doc 01 §7
```

`removeCustomAttribute` deletes the values too. Orphan values in `custom` would
reappear as columns on export.

---

## 4. Performance

**The structure index must not rebuild during a drag.** It depends on
`[nodes, edges]`, and a drag mutates `nodes`. Two mitigations:

1. Key the memo on structural identity, not the array reference:
   ```ts
   const structuralKey = (nodes, edges) =>
     `${nodes.length}:${edges.length}:${nodes.map(n => n.id).join()}`;
   ```
   Position-only changes leave it unchanged.

2. Have React Flow own transient drag positions and call `moveNodes` on
   `onNodeDragStop` only. During the drag, React Flow's internal node state
   drives rendering.

Option 2 is cleaner and is the recommendation; option 1 is the safety net for
anything that must react mid-drag. Doc 05 §4 covers the React Flow side.

**Subscribe narrowly.** `NodeCard` selects only its own node:

```ts
const node = useProjectStore(s => s.project?.nodes.find(n => n.id === id), shallow);
```

A component subscribing to `s.project` re-renders on every keystroke anywhere.
With 500 mounted cards that is the difference between usable and not.

**Recap is one bottom-up pass**, memoized on the structural key plus a figures
hash — not 500 independent `subtreeTotals` calls. Doc 07 §3.

---

## 5. Edge cases

**Undo across a category change that nulled levels.** The inverse patch restores
the `jenjangId` values, because nulling happened inside the same `commit`. This is
the payoff for routing everything through one entry point.

**Undo past an import.** Not possible — history clears on import. The dialog says
so before committing.

**Fifty-step ceiling reached mid-transaction.** `slice(-50)` runs on close, so an
open transaction is never truncated halfway.

**Two rapid drags of different nodes.** Different `sessionId`s, so they do not
coalesce. Correct: they are separate intentions.

**`commit` called with no project loaded.** Early return. Every action must
tolerate a null project; the app has a legitimate empty state.

---

## 6. Exit criteria

- [ ] No code path mutates `project` outside `commit`; grep for `set({ project`
      finds only `commit`, `undo`, `redo`, and project load
- [ ] Dragging a node 3 seconds produces exactly one history entry
- [ ] Ctrl+Z immediately after a drag reverts that drag
- [ ] Typing a word then pausing 1 s then typing again produces two entries
- [ ] Clicking into a field and out without editing produces zero entries
- [ ] Redo after a coalesced drag restores the final position, not an intermediate
- [ ] Structure index rebuild count is 0 during a 500-node drag (instrumented)
- [ ] History cleared on project switch, verified by attempting undo after switch
- [ ] 50-step ceiling verified: 60 edits leaves exactly 50 entries
- [ ] Selection changes produce no history entries
