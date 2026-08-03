# 05 — Canvas & Layout

## Purpose

A free-form canvas where dragging never changes structure, node cards that show
figures without becoming unreadable, and a Tidy button that is one undo step.

---

## 1. React Flow wiring

```tsx
<ReactFlow
  nodes={rfNodes}
  edges={rfEdges}
  nodeTypes={{ unit: UnitCard, jabatan: JabatanCard }}
  edgeTypes={{ hirarki: HierarchyEdge }}

  onNodesChange={handleNodesChange}
  onNodeDragStart={handleDragStart}
  onNodeDragStop={handleDragStop}
  onSelectionChange={({ nodes }) => ui.select(nodes.map(n => n.id))}

  snapToGrid
  snapGrid={[16, 16]}
  selectionOnDrag
  panOnDrag={[1, 2]}            // middle/right button pans; left drags selection
  multiSelectionKeyCode="Shift"
  deleteKeyCode={null}          // intercepted for the confirmation dialog

  nodesConnectable={false}      // MVP: no edge drawing — parent is set via dropdown
  onlyRenderVisibleElements
  minZoom={0.1}
  maxZoom={2}
  defaultViewport={project.viewport}
  onMoveEnd={(_, vp) => saveViewport(vp)}
  proOptions={{ hideAttribution: false }}
>
  <Background variant="dots" gap={16} />
  <Controls showInteractive={false} />
  <MiniMap nodeColor={n => kategoriWarna(nodeById(n.id))} pannable zoomable />
</ReactFlow>
```

Three settings carry design decisions.

**`nodesConnectable={false}`** is how invariant 2 is enforced at the widest
possible gate. If handles can't be dragged, no interaction on the canvas can
change parentage — the guard isn't a check that might be bypassed, it's an absent
affordance. When V1 adds coordination relations, connectability turns on only in an
explicit "draw relation" mode.

**`deleteKeyCode={null}`** because Delete must route through `canDelete()` and a
confirmation naming the child count. React Flow's built-in delete would silently
strip a subtree's edges.

**`onlyRenderVisibleElements`** is required, not optional, at the 500-node target.

---

## 2. Store → React Flow projection

The store holds `OrgNode`; React Flow needs its own shape. Projection is memoized
and must not allocate new node objects when nothing relevant changed.

```ts
function useRfNodes(): RfNode[] {
  const nodes = useProjectStore(s => s.project?.nodes ?? []);
  const visible = useVisibleNodeIds();               // collapse-aware
  const findings = useFindingsByNode();
  const showJenjang = useUiStore(s => s.showJenjangOnCard);

  return useMemo(() => nodes
    .filter(n => visible.has(n.id))
    .map(n => ({
      id: n.id,
      type: n.type,
      position: n.position,
      data: {
        node: n,
        totals: nodeTotals(n.id),
        subtotals: n.type === 'unit' ? subtreeTotals(n.id) : null,
        childCount: childrenOf(n.id).length,
        hasFindings: findings.has(n.id),
        showJenjang,
      },
      selected: undefined,                           // React Flow owns selection
    })),
  [nodes, visible, findings, showJenjang]);
}
```

Edges are filtered by kind and hidden when either endpoint is collapsed away:

```ts
const rfEdges = useMemo(() =>
  hierarchyEdges(edges)
    .filter(e => visible.has(e.source) && visible.has(e.target))
    .map(e => ({ id: e.id, source: e.source, target: e.target,
                 type: 'hirarki', selectable: false, focusable: false })),
[edges, visible]);
```

`selectable: false` on edges: there is nothing to do with a selected hierarchy
edge in MVP, and selectable edges steal clicks meant for the canvas.

### Collapse

Collapsed nodes hide their entire subtree. Computed once per structural change:

```ts
function visibleNodeIds(): Set<string> {
  const idx = structureIndex();
  const visible = new Set<string>();
  const walk = (id: string) => {
    visible.add(id);
    if (nodeById(id).collapsed) return;              // stop descending
    for (const c of idx.childIds.get(id) ?? []) walk(c);
  };
  rootNodes().forEach(r => walk(r.id));
  orphanNodes().forEach(o => walk(o.id));            // orphans stay visible
  return visible;
}
```

A collapsed node shows a badge with its hidden descendant count and its aggregate
figures — collapsing must not hide the numbers, or the recap and the canvas
appear to disagree.

---

## 3. Node cards

### Unit card

```
┌────────────────────────────┐
│ ▸ SEKRETARIAT              │   ▸ = collapse toggle, shown if childCount > 0
│ ────────────────────────── │
│ Keb 24 · Eks 19 · −5       │   aggregate, read-only, muted styling
└────────────────────────────┘
```

Read-only figures are styled as text, not as fields — no border, no input
affordance. This is the visual half of invariant 1; the data half is in the model.

### Position card, non-functional

```
┌────────────────────────────┐
│ KEPALA SUB BAGIAN UMUM     │
│ Pengawas                   │   jenjang label, if any
│ ────────────────────────── │
│ Keb 1 · Eks 1 · 0          │
└────────────────────────────┘
```

### Position card, functional with level rows

```
┌────────────────────────────┐
│ ANALIS KEPEGAWAIAN         │
│ Fungsional · Keahlian      │
│ ────────────────────────── │
│ Keb 7 · Eks 5 · −2         │   node total
│ AMu 3/2 · AP 4/3           │   per-level, using singkatan
└────────────────────────────┘
```

The compact breakdown uses `jenjangSingkatan` from config and reads
`kebutuhan/eksisting`. Hidden when `showJenjangOnCard` is false, or when the node
has one row (redundant with the total line).

### Combined unit-head card

When a unit has exactly one child of a structural category (and is neither a
link nor a template), the two render as one card:

```
┌────────────────────────────┐
│ SEKRETARIAT                │
│ Sekretaris · 1/1           │   the head's name + its own figures
│ ────────────────────────── │
│ Keb 42 · Eks 38 · −4       │   unit aggregate
└────────────────────────────┘
```

Rules that keep this a pure presentation concern:

- **Data stays two nodes.** Selection targets the unit; a click on the head
  line selects the head node. The property panel, recap, and export see two
  nodes exactly as before.
- The head node is removed from the rendered node set and its edge hidden;
  the unit card's `nodeHeight` grows by one `LINE_H`. Dagre therefore lays out
  the merged footprint — which is also why the merge must be computed *before*
  layout, in the projection layer, not as a CSS trick.
- Other children of the unit (JF, pelaksana, sub-units) connect to the unit
  card as usual — visually they hang from the combined box, matching
  conventional charts and the brief §4 placement rule.
- A global toggle (`ui.combineUnitHead`, default on) disassembles the merge
  for operators who want the raw structure; the toggle is UI state, never
  persisted in the project.
- The merge condition is evaluated per render: adding a second structural
  child (which also fires `UNIT_BANYAK_KEPALA`) splits the card automatically.

Link-node and template-unit cards are specified in doc 13 §4 and doc 15 §3;
both are ordinary React Flow node types added to `nodeTypes`, sized through the
same `nodeHeight` function.

### Sizing

Dagre needs dimensions before render, and functional cards vary in height. Compute
deterministically rather than measuring:

```ts
const NODE_W = 220;
const CARD_BASE_H = 76;
const LINE_H = 18;

function nodeHeight(n: OrgNode, showJenjang: boolean): number {
  let h = CARD_BASE_H;
  if (n.type === 'jabatan' && n.kategoriId) h += LINE_H;      // classification line
  if (showJenjang && n.rincian.length > 1) {
    const perLine = 2;
    h += LINE_H * Math.ceil(n.rincian.length / perLine);
  }
  return h;
}
```

Fixed width keeps Dagre output tidy and makes long names wrap rather than stretch;
names truncate at two lines with a title tooltip.

A measured-height approach (React Flow's `node.measured`) is more accurate but
requires layout to wait for a render pass, which makes Tidy feel laggy and makes
`applyLayout` asynchronous — and therefore awkward to keep as one undo step.
Deterministic sizing is the right trade here; it needs `nodeHeight` and the card
CSS kept in sync, which a single test asserting rendered height against
`nodeHeight` covers.

### Memoization

```tsx
export const JabatanCard = memo(function JabatanCard({ data }: NodeProps<CardData>) { … },
  (a, b) =>
    a.data.node === b.data.node &&
    a.data.totals.kebutuhan === b.data.totals.kebutuhan &&
    a.data.totals.eksisting === b.data.totals.eksisting &&
    a.data.hasFindings === b.data.hasFindings &&
    a.data.showJenjang === b.data.showJenjang &&
    a.selected === b.selected
);
```

Without this, editing one node's name re-renders 500 cards.

---

## 4. Drag handling

Position updates are owned by React Flow during the drag and committed once at the
end. This is what keeps the structure index from rebuilding mid-drag (doc 03 §4).

```ts
const dragSession = useRef<string | null>(null);

function handleDragStart() {
  dragSession.current = `drag:${uuid()}`;
}

function handleNodesChange(changes: NodeChange[]) {
  // Let React Flow apply position changes to its internal state only.
  // Do NOT commit here — this fires at frame rate.
  applyNodeChanges(changes, rfInternalNodes);
}

function handleDragStop(_evt, _node, draggedNodes: RfNode[]) {
  const moves = draggedNodes.map(n => ({
    id: n.id,
    position: { x: snap(n.position.x), y: snap(n.position.y) },
  }));
  moveNodes(moves, dragSession.current!);            // one history entry
  closePendingTransaction();
  dragSession.current = null;
}

const snap = (v: number) => Math.round(v / 16) * 16;
```

`handleDragStop` receives all dragged nodes, so multi-select drag is one entry
covering every moved node. Snapping is re-applied on commit because React Flow's
snap is visual and can leave sub-pixel drift.

**Dragging a parent does not move its children.** On a free canvas, subtree-drag
would be a hidden structural behavior. Operators who want it use Tidy or a
subtree multi-select. (V1 may add Alt-drag for subtree movement; it should be an
explicit modifier, never the default.)

---

## 5. Tidy (Dagre auto-layout)

```ts
import dagre from '@dagrejs/dagre';

interface TidyOptions {
  direction: 'TB' | 'LR';
  scope: 'all' | 'subtree';
  rootId?: string;                                   // required when scope === 'subtree'
}

function computeLayout(opts: TidyOptions): Map<string, XY> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: opts.direction, nodesep: 40, ranksep: 70, marginx: 40, marginy: 40 });
  g.setDefaultEdgeLabel(() => ({}));

  const scopeIds = opts.scope === 'subtree'
    ? new Set(subtreeOf(opts.rootId!).map(n => n.id))
    : new Set(nodes().map(n => n.id));

  for (const n of nodes()) {
    if (!scopeIds.has(n.id)) continue;
    g.setNode(n.id, { width: NODE_W, height: nodeHeight(n, showJenjang) });
  }

  // CRITICAL: hierarchy edges only. Coordination and guidance relations (V1)
  // would distort ranks badly — they connect across branches by design.
  for (const e of hierarchyEdges(edges())) {
    if (scopeIds.has(e.source) && scopeIds.has(e.target)) g.setEdge(e.source, e.target);
  }

  dagre.layout(g);

  const out = new Map<string, XY>();
  for (const id of scopeIds) {
    const d = g.node(id);
    if (!d) continue;                                // unplaced node, not in graph
    out.set(id, { x: snap(d.x - NODE_W / 2), y: snap(d.y - d.height / 2) });
  }
  return out;
}
```

Dagre reports centers; React Flow expects top-left. Forgetting the conversion
produces a layout that looks almost right and is uniformly offset by half a card.

### Subtree scope must preserve the anchor

A subtree tidy that relocates the subtree elsewhere on the canvas is disorienting.
Translate the result so the subtree root stays where it was:

```ts
function applyTidy(opts: TidyOptions) {
  let positions = computeLayout(opts);

  if (opts.scope === 'subtree') {
    const anchor = nodeById(opts.rootId!).position;
    const computed = positions.get(opts.rootId!)!;
    const dx = anchor.x - computed.x, dy = anchor.y - computed.y;
    positions = new Map([...positions].map(([id, p]) => [id, { x: p.x + dx, y: p.y + dy }]));
  }

  applyLayout(positions, opts.scope);                // one history entry
}
```

### Unplaced nodes

Nodes with no parent aren't part of the Dagre graph in `'all'` scope beyond being
isolated vertices, and Dagre will scatter them. Handle explicitly: exclude them
from the graph, then arrange them in a column to the right of the laid-out bounds.
They stay grouped and visibly "outside" the structure, which matches what the
Unplaced panel says about them.

### First-use confirmation

On the first whole-canvas Tidy in a project, confirm: *"Rapikan akan menata ulang
posisi seluruh node. Bisa dibatalkan dengan Ctrl+Z."* Recording the acknowledgment
in `ui` state (not the project) means it appears once per session, not once ever —
the reassurance is cheap and the operator may be new to the tool each time.

Subtree Tidy never confirms; its scope is visible in the selection.

---

## 6. Fit, focus, and viewport

```ts
fitAll(): void                                       // fitView with 0.1 padding
focusNode(id: string, zoom = 1.2): void              // centers; used by findings click-through
fitSubtree(rootId: string): void
```

`focusNode` must expand collapsed ancestors first, or it centers on empty canvas:

```ts
function focusNode(id: string, zoom = 1.2) {
  const collapsed = ancestorsOf(id).filter(a => a.collapsed);
  if (collapsed.length) {
    commit('Buka node', draft => {
      for (const a of collapsed) {
        const n = draft.nodes.find(x => x.id === a.id)!;
        n.collapsed = false;
      }
    });
  }
  const n = nodeById(id);
  rf.setCenter(n.position.x + NODE_W / 2, n.position.y + nodeHeight(n) / 2, { zoom, duration: 300 });
  ui.select([id]);
}
```

Auto-expanding is itself a mutation and therefore undoable — which is correct; the
operator can Ctrl+Z back to their collapsed view.

Viewport persists in the project and is saved `transient` (no history entry).
Panning is not an edit.

---

## 7. Keyboard

| Key | Action |
|---|---|
| Tab | Add child of selected node, select it, focus its name field |
| Enter | Add sibling of selected node |
| Delete | Delete with confirmation if it has children |
| Ctrl+D | Duplicate node |
| Ctrl+Shift+D | Duplicate subtree |
| Space (hold) | Temporary pan |
| Ctrl+0 | Fit all |
| Ctrl+Z / Ctrl+Shift+Z | Undo / redo |
| Escape | Clear selection |

Tab is intercepted only when the canvas has focus and a node is selected;
otherwise it must remain browser tab navigation. Breaking keyboard accessibility
across the whole app to gain one shortcut is not a trade worth making.

Tab and Enter both place the new node and open its name field, so an operator can
build a branch without touching the mouse — the fastest path for someone typing
from a printed structure.

---

## 8. Edge cases

**Two nodes at identical coordinates** (duplicate, or import before tidy). Cards
overlap and one is unreachable. `placeBelowParent` and `duplicateNode` offset by
40px, and post-import Tidy runs automatically.

**Extreme zoom-out at 500 nodes.** Text is unreadable below ~0.4 zoom; below that,
render a simplified card (name only, no figures) via a zoom threshold from
`useStore(s => s.transform[2])`. This is also a large render win.

**Collapse the root.** Everything vanishes and the canvas looks broken. Root is
collapsible but its badge stays prominent, and `fitAll` still centers on it.

**Node dragged far off-canvas.** Not restricted — a large structure legitimately
spreads out. `fitAll` and the minimap are the recovery paths.

**`nodeHeight` diverging from actual CSS.** Produces overlapping rows after Tidy.
Covered by one test asserting rendered height equals `nodeHeight` for each card
variant.

---

## 9. Exit criteria

- [ ] No canvas interaction can change parentage; `nodesConnectable` is false
- [ ] Dragging 20 selected nodes produces exactly one history entry
- [ ] Dragging a parent leaves children in place
- [ ] Tidy on whole canvas is one Ctrl+Z
- [ ] Subtree Tidy keeps the subtree root at its original coordinates
- [ ] Dagre receives only `kind === 'hirarki'` edges
- [ ] Dagre center-to-top-left conversion verified against a two-node fixture
- [ ] Unplaced nodes arranged in a column outside the structure bounds, not scattered
- [ ] Collapsed node shows descendant count and aggregate figures
- [ ] `focusNode` expands collapsed ancestors and the expansion is undoable
- [ ] Functional card height matches `nodeHeight` for 1, 2, 3, and 4 rows
- [ ] 500-node project pans and zooms without dropped frames
