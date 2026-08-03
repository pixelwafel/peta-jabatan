# 11 — UI Shell & Components

## Purpose

The frame everything sits in, and the component contracts that keep 500 mounted
node cards from re-rendering on every keystroke.

---

## 1. Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Toolbar                                              48px   │
├──────────┬──────────────────────────────┬───────────────────┤
│ Left     │                              │ Property panel    │
│ 280px    │ Canvas (flex-1)              │ 320px             │
│ collapse │                              │ collapse          │
├──────────┴──────────────────────────────┴───────────────────┤
│ Status bar                                           28px   │
└─────────────────────────────────────────────────────────────┘
```

CSS Grid, fixed side columns, canvas takes the remainder. Both sidebars collapse to
a 36px icon rail — on a 1366×768 laptop, which is what most agency machines are,
the canvas is otherwise 760px wide and unusable for a wide chart.

```css
.shell {
  display: grid;
  grid-template-columns: var(--left, 280px) 1fr var(--right, 320px);
  grid-template-rows: 48px 1fr 28px;
  height: 100vh;
  overflow: hidden;
}
```

`overflow: hidden` on the shell and internal scrolling per panel. A page-level
scrollbar with a canvas in it produces a scroll behavior nobody can predict.

Below 1024px the sidebars become overlays. The tool is not designed for phones —
building a position map on a 6-inch screen is not a real workflow — but a tablet at
768px should be usable for review.

---

## 2. Toolbar

```
┌──────────────────────────────────────────────────────────────────────┐
│ [≡ Project ▾] │ [+ Node ▾] [⌗ Rapikan ▾] │ [↶] [↷] │ [✓ Cek] │ [↧ ▾] │
└──────────────────────────────────────────────────────────────────────┘
```

| Group | Contents |
|---|---|
| Project | Project list, new, import JSON, import Excel, project settings |
| Add | Add unit, add position, add child of selection |
| Tidy | Whole canvas, selected subtree, direction TB/LR, renumber |
| History | Undo, redo — disabled when the respective stack is empty |
| Check | Readiness check; badge with error/warning counts |
| Export | Opens the export dialog |

Undo/redo tooltips name the operation from `HistoryEntry.label`
(*"Batalkan: Ubah nama"*). That label exists precisely for this and it is what makes
undo feel predictable rather than a leap of faith.

The Check badge is the app's main ambient signal. Red for errors, amber for
warnings, neutral when clean.

Nothing here is icon-only. Operators use this tool a few times a year, so there is
no learning curve to amortize — icon-only toolbars serve daily users and punish
occasional ones.

---

## 3. Left sidebar

Three tabs: Tree, Unplaced, Recap.

### Tree

```tsx
function TreeView() {
  const tree = useTree();                              // doc 04 §1
  const selected = useUiStore(s => s.selectedNodeIds);
  return <VirtualList items={flatten(tree)} itemHeight={28} render={row => (
    <TreeRow node={row} selected={selected.includes(row.id)}
             onClick={() => focusNode(row.id)}
             onToggle={() => toggleCollapse(row.id)} />
  )} />;
}
```

Virtualized — 500 rows of DOM inside a scroll container is a measurable cost for
something usually mostly off-screen.

Each row: indent by depth, collapse chevron, `nomor` prefix, name, and figures
right-aligned. Clicking focuses the node on canvas; the tree is the primary
navigation for a chart too large to see at once.

Collapse state is shared with the canvas — the same `node.collapsed` field. Two
independent collapse states would be a permanent source of confusion.

### Unplaced

The work queue from doc 04 §5. Nodes with `NODE_NO_PARENT`, each with an inline
parent dropdown:

```
┌─ BELUM DITEMPATKAN (8) ────────┐
│ Analis Kepegawaian             │
│   Atasan: [pilih… ▾]           │
│ Pengelola Data                 │
│   Atasan: [pilih… ▾]           │
└────────────────────────────────┘
```

Assigning a parent removes the row immediately. Clearing eight strays is eight
dropdown selections without leaving the panel — the difference between a five-minute
task and a fifteen-minute one.

### Recap

Doc 07 §4.

---

## 4. Status bar

```
Tersimpan 14:32 · belum diekspor ⚠ │ 89 node · 112 rincian │ Keb 248 · Eks 201 · −47 │ v1.0.3
```

Save status (doc 10 §3), counts, project totals, app version. The version is not
vanity — it is the first question in any support conversation, and cached stale
builds are the most likely cause of unexplainable behavior.

Totals here duplicate the recap panel deliberately. They are the number the operator
glances at constantly, and it should not require an open panel.

---

## 5. Component contracts

The performance-critical ones. Everything else is ordinary.

```ts
// Renders 500× — memoized on data identity, see doc 05 §3
interface NodeCardProps {
  data: {
    node: OrgNode;
    totals: NodeTotals;
    subtotals: NodeTotals | null;
    childCount: number;
    hasFindings: boolean;
    showJenjang: boolean;
  };
  selected: boolean;
}

// Subscribes to one node only; never to `s.project`
interface PropertyPanelProps { nodeId: string | null }

// Pure; receives findings, does not compute them
interface FindingsListProps {
  findings: Finding[];
  groupByCode?: boolean;
  onFocus: (nodeId: string) => void;
}

// Searchable, indented, nomor-prefixed — doc 06 §5
interface ParentSelectProps {
  childId: string;
  value: string | null;
  onChange: (parentId: string | null) => void;
}

// Used by chip picker and rumpun selector — doc 06 §2, §4
interface ChipProps { label: string; active: boolean; onClick: () => void; disabled?: boolean }
```

### Subscription discipline

The rule that determines whether the app is usable at 500 nodes:

```ts
// WRONG — re-renders on every keystroke anywhere in the project
const project = useProjectStore(s => s.project);
const node = project?.nodes.find(n => n.id === id);

// RIGHT — re-renders only when this node changes
const node = useProjectStore(s => s.project?.nodes.find(n => n.id === id));
```

Zustand compares the selector result by reference. Immer preserves references for
untouched objects, so editing node A leaves node B's reference identical and B does
not re-render. This only works if selectors return the narrowest possible slice —
one violation in a component mounted 500 times undoes the whole optimization.

Add a dev-mode render counter overlay. Editing one node's name should show a render
count of 1, not 500. Without instrumentation this regresses silently in the first
refactor.

---

## 6. Dialogs

One controller, one shape. No component owns its own modal.

```ts
type DialogState =
  | { kind: 'confirm'; title: string; body: string; confirmLabel?: string;
      danger?: boolean; requireTyping?: string; onConfirm: () => void }
  | { kind: 'readiness'; report: ReadinessReport }
  | { kind: 'importPreview'; preview: ImportPreview; onCommit: () => void }
  | { kind: 'export' }
  | { kind: 'projectManager' }
  | { kind: 'projectSettings' }
  | { kind: 'attributeSchema' }
  | { kind: 'alert'; title: string; body: string; dismissible: boolean; actions: DialogAction[] };
```

`requireTyping` carries the agency-name confirmation for deleting an unexported
project (doc 10 §6). Making it a field on the generic confirm rather than a bespoke
dialog means the pattern is available anywhere it is warranted, and consistent
wherever it appears.

Confirmations that destroy data must **name the data**: figures, counts, node
names. This recurs in doc 06 §2 and §4 and doc 10 §6 because it is the difference
between a dialog that informs and a dialog that trains reflex dismissal.

---

## 7. Visual design

**Colors.** Node accents come from `taxonomy.json` (doc 02 §1), so the palette is
configuration, not code. UI chrome is neutral grey; the only saturated colors on
screen are node accents and `selisih` states. A colorful interface competes with the
one thing that should carry color meaning.

**`selisih` encoding:**

| Value | Color | Reasoning |
|---|---|---|
| Negative | Red | Understaffed — the primary finding |
| Zero | Neutral | Balanced |
| Positive | Amber | Over-established — also worth noticing, not a success |

Amber for positive is a deliberate choice against the instinct to make it green.

**Typography.** System UI stack; Inter if bundling is acceptable offline. Tabular
figures (`font-variant-numeric: tabular-nums`) everywhere numbers appear in columns
— without it, digits shift width and every figure column looks misaligned.

**Density.** Compact. This is a data tool for someone entering eighty positions;
generous whitespace means more scrolling and fewer rows visible at once.

**Light theme only** at MVP, per the brief. Do not scatter hard-coded colors, though
— CSS custom properties throughout, so a dark theme is a variable swap later.

---

## 8. Accessibility & WCAG 2.1 AA Compliance

Government digital tools have accessibility obligations. Accessibility features are built-in:

### 8.1 ARIA Landmarks & Structure
- `<header role="banner">` for the top toolbar.
- `<main role="main">` for the central canvas area.
- `<nav aria-label="Struktur Organisasi">` for left sidebar tree.
- `<aside aria-label="Panel Properti">` for right sidebar.
- `<footer role="contentinfo">` for the status bar.

### 8.2 Keyboard Navigation & Focus Management
- Every control is keyboard-reachable with visible focus rings (`:focus-visible` with 2px offset ring, never `outline: none`).
- Canvas nodes are reachable via Arrow key navigation when canvas has focus (`aria-activedescendant` tracks active node).
- Dialogs trap focus (`FocusTrap`), close on Escape key, and restore focus to trigger button upon closing.
- Tab interception (doc 05 §7) is strictly scoped to when canvas element has explicit focus.

### 8.3 Screen Reader & Contrast Standards
- **Color & Contrast**: Minimum 4.5:1 contrast ratio for normal text and 3:1 for large text / UI elements under light theme.
- **Color Independence**: Color is never the sole indicator — `selisih` carries positive/negative signs (`-4`, `+2`), findings carry distinct icons (`[!]`, `[x]`).
- **Live Regions**: Findings count badge uses `aria-live="polite"` so screen readers announce background validation updates.
- **Form Controls**: Every input in Property Panel has an explicit `<label htmlFor="...">` and `aria-describedby` pointing to field hint/error text.

---

## 9. Empty states

Each empty state is a next action, not an apology.

**No projects.** Three buttons: new project, import JSON, import Excel — with a note
that the Excel path is usually fastest if a position list already exists. The
template link sits here too, because this is the moment the operator needs it.

**Empty project.** Canvas shows a single prompt to add the top position, plus the
import shortcut. Nobody starting fresh has thought about the sidebars yet.

**Nothing selected.** Property panel shows project metadata (doc 06 §1), which is
what should be filled first anyway.

**No findings.** *"Tidak ada temuan. Struktur siap diekspor."* Positive
confirmation, because a silent empty panel reads as broken.

---

## 10. Edge cases

**Very long node names.** Cards truncate at two lines with a `title` tooltip; tree
rows truncate with ellipsis. Never wrap into variable-height cards — `nodeHeight`
(doc 05 §3) must stay predictable for Dagre.

**Property panel open on a deleted node.** Panel falls back to the empty state.
Components hold `nodeId`, not node objects, so the lookup simply returns undefined.

**Both sidebars collapsed on a narrow window.** Canvas gets full width; the icon
rails stay, so nothing becomes unreachable.

**Browser zoom at 150%** (common on agency machines with small high-DPI screens).
Layout must hold — no fixed pixel heights on text containers.

**Reduced motion.** Respect `prefers-reduced-motion`: disable the `focusNode`
transition and dialog animation.

---

## 11. Exit criteria

- [ ] Shell layout holds at 1366×768 with both sidebars open
- [ ] Sidebars collapse to icon rails; canvas takes the space
- [ ] Tree view virtualized; 500 nodes scroll smoothly
- [ ] Tree collapse state shared with canvas
- [ ] Editing one node's name renders 1 card, not 500 (dev overlay verified)
- [ ] All dialogs routed through the single controller
- [ ] Destructive confirmations name the affected data
- [ ] `requireTyping` confirmation works for unexported project deletion
- [ ] Undo/redo tooltips name the operation
- [ ] Status bar shows save state, counts, totals, app version
- [ ] Unplaced panel assigns parents inline without navigation
- [ ] Tabular figures applied to every numeric column
- [ ] `selisih` conveys state by sign as well as color
- [ ] Focus visible on every control; dialogs trap and restore focus
- [ ] Tab interception scoped to canvas focus
- [ ] Every empty state offers a next action
- [ ] Layout holds at 150% browser zoom
- [ ] `prefers-reduced-motion` respected
