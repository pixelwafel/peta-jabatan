# 01 — Architecture & Data Model

## Purpose

Define every persisted and in-memory type once, so no other module invents its
own shape. This document is the single authority for the data model; other
documents reference these names without redefining them.

---

## 1. Module boundaries

```
                      ┌─────────────┐
                      │   config/   │  taxonomy.json (read-only, bundled)
                      └──────┬──────┘
                             │
     ┌───────────────────────▼───────────────────────┐
     │              store/project                    │
     │   nodes · edges · attributeSchema · meta      │
     │   the only mutable source of truth            │
     └───┬───────────┬───────────┬───────────┬───────┘
         │           │           │           │
   ┌─────▼────┐ ┌────▼─────┐ ┌───▼────┐ ┌────▼──────┐
   │ selectors│ │ history  │ │ persist│ │ validation│
   │ (derived)│ │ (patches)│ │ (IDB)  │ │ (findings)│
   └─────┬────┘ └──────────┘ └────────┘ └───────────┘
         │
   ┌─────▼───────────────────────────────────────────┐
   │  canvas · tree · property panel · recap · io    │
   │  all read through selectors, write via actions  │
   └─────────────────────────────────────────────────┘
```

**Rules that keep this honest:**

- No component reads `store.nodes` directly to compute anything aggregate. It
  goes through a selector. This is what makes the recap and the canvas
  structurally incapable of disagreeing.
- No module mutates state outside a store action. History depends on it.
- `config` is imported, never stored in the project — only `configVersion` is.

---

## 2. Persisted types

### 2.1 Project

```ts
interface Project {
  id: string;                    // uuid, also the IndexedDB key suffix
  schemaVersion: string;         // '1.0.0' — see doc 10 for migration
  configVersion: string;         // taxonomy version this data was entered under
  meta: ProjectMeta;
  attributeSchema: CustomAttribute[];
  nodes: OrgNode[];
  edges: OrgEdge[];
  instances?: UnitInstance[];    // template-instance figures — doc 15 §1
  viewport: Viewport;
  createdAt: string;             // ISO 8601
  updatedAt: string;
}

interface ProjectMeta {
  namaOPD: string;               // agency name — required for export filename
  kodeOPD: string;               // agency code — required for consolidation
  penyusun: string;              // author
  tahunAnggaran?: string;        // budget year, e.g. '2027'
  keterangan?: string;
}

interface Viewport { x: number; y: number; zoom: number }
```

`namaOPD` and `kodeOPD` are not optional in practice even though a project can be
created before they're filled. The Readiness Check treats them as required. This
is the difference between *soft-required* (flagged) and *hard-required* (blocked)
that recurs throughout: nothing is hard-required except what would corrupt data.

### 2.2 Node

```ts
type NodeType = 'unit' | 'jabatan';
type Rumpun = 'keahlian' | 'keterampilan';

interface OrgNode {
  id: string;                    // uuid v4, never shown to the user
  type: NodeType;

  // identity
  nama: string;
  nomor: string;                 // hierarchical, e.g. '1.2.1' — editable
  kode?: string;                 // position code

  // classification — ids referencing taxonomy, not display labels
  kategoriId?: string;           // undefined for type === 'unit'
  rumpun: Rumpun[];              // [] unless kategori is functional

  // figures
  rincian: Rincian[];            // ALWAYS [] when type === 'unit'

  // descriptive
  unitKerja?: string;
  keterangan?: string;
  custom: Record<string, CustomValue>;

  // multi-project layer (Stage B; both optional — Stage A files valid without)
  link?: LinkRef;                // reference to another project — doc 13 §1
  isTemplate?: boolean;          // unit whose figures live in instances — doc 15 §1

  // presentation
  position: { x: number; y: number };
  collapsed: boolean;
}

interface Rincian {
  id: string;                    // uuid
  jenjangId: string | null;      // null for non-functional single row
  kebutuhan: number;             // integer >= 0
  eksisting: number;             // integer >= 0
}
```

**Why `kategoriId` and `jenjangId` rather than labels.** Regulations rename
things. Storing `'ahli_muda'` and resolving the label through config means a
terminology change is a config edit, not a data migration. It also makes the
level chip picker and the XLSX dropdown share one key space.

**Why `rumpun` is an array.** A functional position can belong to both the
expertise and skill tracks; the brief called this "dan/atau". An array with zero,
one, or two entries handles all cases without a fourth enum value.

### 2.3 Edge

```ts
type EdgeKind = 'hirarki' | 'koordinasi' | 'pembinaan';   // latter two: V1

interface OrgEdge {
  id: string;
  source: string;                // parent node id
  target: string;                // child node id
  kind: EdgeKind;
}
```

In MVP only `'hirarki'` is created, but the field exists from day one so V1 does
not require a migration. **Every consumer must filter by kind.** A helper exists
precisely so nobody forgets:

```ts
const hierarchyEdges = (edges: OrgEdge[]) => edges.filter(e => e.kind === 'hirarki');
```

Tree derivation, cycle checks, Dagre input, the parent column on export, and the
tree sidebar all route through it.

### 2.4 Custom attributes

```ts
type AttrType = 'text' | 'number' | 'dropdown' | 'boolean' | 'date' | 'multiline';
type CustomValue = string | number | boolean | null;

interface CustomAttribute {
  id: string;                    // slug, stable — becomes the XLSX column header
  nama: string;                  // display label
  tipe: AttrType;
  opsi?: string[];               // dropdown only
  wajib?: boolean;               // soft-required: surfaces in readiness check
}
```

`id` is a slug rather than a uuid because it becomes a spreadsheet column header
and appears in exported files that humans read and edit. `formasi_2027` survives a
round trip through Excel; a uuid does not survive a human.

---

## 3. Derived types (never persisted)

```ts
interface NodeTotals {
  kebutuhan: number;
  eksisting: number;
  selisih: number;               // eksisting - kebutuhan
}

interface TreeNode {
  id: string;
  children: TreeNode[];
  depth: number;
}

type Severity = 'error' | 'warning' | 'info';

interface Finding {
  code: string;                  // e.g. 'NODE_NO_PARENT', 'IMPORT_BAD_NUMBER'
  severity: Severity;
  message: string;               // Indonesian, user-facing
  nodeId?: string;               // click-to-focus target
  rowNumber?: number;            // import findings only
  field?: string;
}
```

`Finding` is deliberately shared between validation, the readiness check, and
import parsing. One shape means one renderer, one list component, one
click-to-focus behavior. Adding a second finding type later is how these systems
diverge.

---

## 4. Invariants and where they are enforced

| # | Invariant | Enforced in |
|---|---|---|
| 1 | `type === 'unit'` ⇒ `rincian.length === 0` | `addNode`, `setNodeType`, import builder, JSON import validator |
| 2 | Non-unit nodes have ≥ 1 `rincian` | `addNode` seeds one row; readiness check flags empties |
| 3 | `kebutuhan`, `eksisting` are non-negative integers | Input coercion in `RincianEditor`; Zod on import |
| 4 | No cycles in hierarchy edges | `canSetParent()` guard — prevention, not validation (doc 04) |
| 5 | At most one hierarchy edge targets a node | `setParent` removes the existing edge before adding |
| 6 | `selisih` never stored | Type system: `OrgNode` has no such field |
| 7 | `jenjangId` valid for the node's `kategoriId` + `rumpun` | `RincianEditor` chip source; import validator |
| 8 | `nomor` unique across nodes | Soft — warning only; the tool must tolerate mid-edit duplicates |
| 9 | `id` unique | uuid generation; import validator rejects duplicates hard |
| 10 | A link node has no hierarchy children, and `link` excludes `isTemplate` | Link creation guard; validator `LINK_HAS_CHILDREN`, `TEMPLATE_LINK_CONFLICT` |
| 11 | Link graphs are acyclic | Creation-time walk over `linkedCodes` (doc 13 §2) |
| 12 | Rows in a template subtree carry zero figures | `RincianEditor` renders totals not inputs; validator `TEMPLATE_ROW_HAS_FIGURES` |
| 13 | Aggregates follow doc 07 §2b (tree + links + instances), nowhere reimplemented | `computeRecap` is the only aggregation site |

Invariant 4 deserves emphasis: cycles are **prevented at the interaction layer**,
not detected afterward. `canSetParent(childId, parentId)` returns false if
`parentId` is a descendant of `childId`, and the Parent dropdown simply excludes
those options. A cycle that never becomes representable needs no repair path.

Invariant 8 is soft on purpose. An operator renumbering by hand will pass through
duplicate states. Blocking that would make renumbering impossible.

---

## 5. Selector layer

All derived reads live here, memoized on `[nodes, edges]` identity.

```ts
// structure
childrenOf(nodeId): OrgNode[]
parentOf(nodeId): OrgNode | null
ancestorsOf(nodeId): OrgNode[]           // root-first
descendantsOf(nodeId): OrgNode[]         // excludes self
subtreeOf(nodeId): OrgNode[]             // includes self
rootNodes(): OrgNode[]                   // nodes with no incoming hierarchy edge
orphanNodes(): OrgNode[]                 // rootNodes() minus the designated root
buildTree(): TreeNode[]
depthOf(nodeId): number

// figures
nodeTotals(nodeId): NodeTotals           // own rincian only
subtreeTotals(nodeId): NodeTotals        // self + all descendants
projectTotals(): NodeTotals

// visibility
visibleNodeIds(): Set<string>            // respects collapsed ancestors
isHiddenByCollapse(nodeId): boolean

// guards
canSetParent(childId, parentId): boolean
canDelete(nodeId): { ok: boolean; childCount: number }
```

### Implementation note: build the adjacency index once

Naive `childrenOf` is O(E) per call; called per node during render that becomes
O(N·E) and will visibly stutter around 300 nodes. Build indices once per state
change:

```ts
interface StructureIndex {
  childIds: Map<string, string[]>;
  parentId: Map<string, string>;
  nodeById: Map<string, OrgNode>;
}

const buildIndex = (nodes, edges): StructureIndex => {
  const childIds = new Map(nodes.map(n => [n.id, [] as string[]]));
  const parentId = new Map<string, string>();
  for (const e of hierarchyEdges(edges)) {
    childIds.get(e.source)?.push(e.target);
    parentId.set(e.target, e.source);
  }
  return { childIds, parentId, nodeById: new Map(nodes.map(n => [n.id, n])) };
};
```

Every selector reads the index. Rebuild on `[nodes, edges]` change only — not on
`position` change, which is why position updates during drag must not invalidate
it. See doc 03 on drag coalescing.

`subtreeTotals` is computed for every unit node on every recap render. Compute all
of them in **one bottom-up pass**, not per node — see doc 07.

---

## 6. Root node identification

The project has one designated root. It is not a flag on the node; it is derived:

```ts
const designatedRoot = (nodes, edges) => {
  const roots = rootNodes(nodes, edges);
  if (roots.length === 0) return null;
  if (roots.length === 1) return roots[0];
  // Multiple parentless nodes: the root is the one with the shortest nomor,
  // tie-broken by creation order. The rest are orphans.
  return roots.sort((a, b) =>
    segmentCount(a.nomor) - segmentCount(b.nomor) || a.nomor.localeCompare(b.nomor)
  )[0];
};
```

Deriving rather than flagging avoids a state where the flagged root has been
deleted and nothing is root. The cost is that during editing the "root" can
briefly be a node the operator didn't intend — acceptable, because the Unplaced
panel makes the situation visible rather than hidden.

---

## 7. Numbering utilities

`nomor` is both an import mechanism and an export column, so its parsing lives in
one place used by both.

```ts
parseNomor(s: string): number[] | null     // '1.2.10' → [1,2,10]; invalid → null
formatNomor(seg: number[]): string          // [1,2,10] → '1.2.10'
parentNomor(s: string): string | null       // '1.2.10' → '1.2'; '1' → null
segmentCount(s: string): number
compareNomor(a: string, b: string): number  // numeric segment-wise, not lexical
```

`compareNomor` must be segment-wise numeric. Lexical sorting puts `1.10` before
`1.2`, which will look like a bug in every sorted list in the application.

```ts
const compareNomor = (a: string, b: string) => {
  const A = parseNomor(a) ?? [], B = parseNomor(b) ?? [];
  for (let i = 0; i < Math.max(A.length, B.length); i++) {
    const d = (A[i] ?? -1) - (B[i] ?? -1);
    if (d !== 0) return d;
  }
  return 0;
};
```

### Renumber from structure

Canvas-created nodes have no meaningful `nomor` until this runs. It is a toolbar
action, undoable, and must be idempotent.

```ts
function renumberFromStructure(): void {
  const root = designatedRoot();
  if (!root) return;
  let assignments = new Map<string, string>();

  const walk = (nodeId: string, prefix: number[]) => {
    assignments.set(nodeId, formatNomor(prefix));
    const kids = childrenOf(nodeId).sort(byPositionThenName);
    kids.forEach((k, i) => walk(k.id, [...prefix, i + 1]));
  };
  walk(root.id, [1]);

  // Orphans keep their existing nomor; renumbering them would imply
  // a placement the operator has not made.
  // Note on Orphan Collision (FIX-18): If an assigned number collides with an
  // orphan's existing nomor, flag NOMOR_DUPLICATE in validation findings; do NOT
  // overwrite the orphan's nomor automatically.
  commit('renumber', draft => {
    for (const n of draft.nodes) {
      const next = assignments.get(n.id);
      if (next) n.nomor = next;
    }
  });
}
```

Child order comes from **canvas position** (left to right), then name. This is the
one place position legitimately influences data — and it is a user-invoked action
with a visible result, not an inference. Sibling order on a free canvas has no
other honest source.

---

## 8. Zod schemas

Runtime validation is needed at exactly two boundaries: JSON import and
LocalStorage read. Everywhere else the type system suffices.

```ts
const zRincian = z.object({
  id: z.string(),
  jenjangId: z.string().nullable(),
  kebutuhan: z.number().int().min(0),
  eksisting: z.number().int().min(0),
});

const zNode = z.object({
  id: z.string(),
  type: z.enum(['unit', 'jabatan']),
  nama: z.string(),
  nomor: z.string(),
  kode: z.string().optional(),
  kategoriId: z.string().optional(),
  rumpun: z.array(z.enum(['keahlian', 'keterampilan'])).default([]),
  rincian: z.array(zRincian).default([]),
  unitKerja: z.string().optional(),
  keterangan: z.string().optional(),
  custom: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
  position: z.object({ x: z.number(), y: z.number() }),
  collapsed: z.boolean().default(false),
})
.refine(n => n.type !== 'unit' || n.rincian.length === 0,
        { message: 'Node unit tidak boleh memiliki rincian angka' });

const zProject = z.object({ /* ... */ }).superRefine((p, ctx) => {
  const ids = new Set<string>();
  for (const n of p.nodes) {
    if (ids.has(n.id)) ctx.addIssue({ code: 'custom', message: `ID duplikat: ${n.id}` });
    ids.add(n.id);
  }
  for (const e of p.edges) {
    if (!ids.has(e.source) || !ids.has(e.target))
      ctx.addIssue({ code: 'custom', message: `Edge menunjuk node yang tidak ada: ${e.id}` });
  }
});
```

Note the `.refine` on invariant 1 and the dangling-edge check. A file with a
dangling edge is repairable (drop the edge) rather than fatal — the import path
should offer repair rather than rejection. See doc 08 §6.

---

## 9. Exit criteria

- [ ] All types above defined in `models/` and imported everywhere; no local
      redefinitions
- [ ] `StructureIndex` rebuilt only on `[nodes, edges]` change, verified by
      instrumenting rebuild count during a drag
- [ ] `compareNomor` unit-tested against `1.2` vs `1.10`
- [ ] `renumberFromStructure` idempotent: running twice produces identical output
- [ ] Zod schemas reject a unit node carrying `rincian`, and a project with
      duplicate node ids
- [ ] `hierarchyEdges()` is the only place `kind` is compared; grep confirms no
      other `=== 'hirarki'`
