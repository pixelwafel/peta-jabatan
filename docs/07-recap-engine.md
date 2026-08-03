# 07 — Recap Engine

## Purpose

Aggregate every detail row into agency totals and breakdowns, in one pass, from the
same data the canvas draws. This is the feature that distinguishes the tool from a
diagram editor, and its correctness requirement is absolute: a recap that
disagrees with the diagram destroys trust in both.

---

## 1. Output shape

```ts
interface RecapBucket {
  key: string;
  label: string;
  kebutuhan: number;
  eksisting: number;
  selisih: number;
  nodeCount: number;                 // positions counted, not rows
}

interface Recap {
  total: RecapBucket;                // whole agency
  perUnit: RecapBucket[];            // one per unit node, in tree order
  perKategori: RecapBucket[];        // config order, zero buckets included
  perJenjang: RecapBucket[];         // functional only, config order
  unplaced: RecapBucket;             // positions with no parent
  nodeTotals: Map<string, NodeTotals>;      // own rows only
  subtreeTotals: Map<string, NodeTotals>;   // self + descendants
}
```

`nodeTotals` and `subtreeTotals` are part of the recap output rather than separate
selectors. Both the canvas and the recap panel need them, and computing them in the
same pass is what guarantees the two surfaces can never show different numbers for
the same node.

`unplaced` is separate from `total`. Whether stray positions belong in the agency
total is genuinely ambiguous — they exist but aren't placed — so the panel shows
both figures rather than deciding. Silently including them makes the total
irreproducible from the visible tree; silently excluding them loses work from the
count.

---

## 2. Aggregation algorithm

One post-order traversal. Every figure in the application derives from this
function.

```ts
function computeRecap(project: Project, cfg: Taxonomy): Recap {
  const idx = buildIndex(project.nodes, project.edges);
  const nodeTotals = new Map<string, NodeTotals>();
  const subtreeTotals = new Map<string, NodeTotals>();

  // Own rows. Units are structurally guaranteed empty (invariant 1),
  // so this needs no type branch.
  for (const n of project.nodes) {
    let keb = 0, eks = 0;
    for (const r of n.rincian) { keb += r.kebutuhan; eks += r.eksisting; }
    nodeTotals.set(n.id, { kebutuhan: keb, eksisting: eks, selisih: eks - keb });
  }

  // Post-order: children complete before the parent sums them.
  const walk = (id: string): NodeTotals => {
    const own = nodeTotals.get(id)!;
    let keb = own.kebutuhan, eks = own.eksisting;
    for (const cid of idx.childIds.get(id) ?? []) {
      const c = walk(cid);
      keb += c.kebutuhan; eks += c.eksisting;
    }
    const t = { kebutuhan: keb, eksisting: eks, selisih: eks - keb };
    subtreeTotals.set(id, t);
    return t;
  };

  const root = designatedRoot(project.nodes, project.edges);
  const orphans = project.nodes.filter(n => !idx.parentId.has(n.id) && n.id !== root?.id);

  const total = root ? walk(root.id) : ZERO;
  for (const o of orphans) walk(o.id);        // populates their subtree maps too

  return {
    total: { key: 'total', label: 'Total OPD', ...total,
             nodeCount: countPositions(root ? subtreeIds(root.id, idx) : []) },
    unplaced: sumBuckets(orphans.map(o => subtreeTotals.get(o.id)!)),
    perUnit: buildPerUnit(project, idx, subtreeTotals),
    perKategori: buildPerKategori(project, cfg, nodeTotals, idx, root),
    perJenjang: buildPerJenjang(project, cfg, idx, root),
    nodeTotals,
    subtreeTotals,
  };
}
```

**Recursion depth.** An org chart is at most 6–8 levels deep, so recursion is safe.
The `walk` implementation should still carry a visited set for defence against a
cyclic imported file — the same reasoning as `buildTree` in doc 04 §1. An infinite
recursion here produces a blank panel with no error.

### §2b — The extended aggregate formula (Stage B)

This is the **only** aggregation formula in the application. Invariant 13
forbids reimplementing it anywhere else.

```
subtreeTotals(unit) =
    Σ own-tree descendant rows                      (the walk above)
  + Σ resolveLink(child).totals                     for link-node children   (doc 13 §3)
  + Σ templateColumnTotals                          if unit isTemplate       (doc 15 §3)
```

Implementation deltas to the walk:

- Before the walk, build `linkTotals: Map<nodeId, NodeTotals>` by calling
  `resolveLink(node.link, index)` for every link node once — **synchronous**,
  because `resolveLink` reads only from the in-memory `index.entries` (see
  doc 13 §2 design note). No async work happens here; the recap remains a
  single synchronous pass. Also build `instanceTotals: Map<rincianId, NodeTotals>`
  in one pass over `project.instances`.
- In the walk, a link node contributes `linkTotals.get(id)` and recurses no
  further (it has no children by invariant 10).
- A position inside a template subtree reads its row totals from
  `instanceTotals` instead of stored figures (which are zero by invariant 12).
- The memo key (§3) gains `instancesRevision` (a counter — hashing 4,500 cells
  per render is not acceptable here) and the link-cache identity.
- Every bucket gains `includesCached: boolean`; the panel renders the clock
  glyph with the oldest link `asOf` in its tooltip wherever it is true.

The identity test in §6 extends in Stage B. With links and templates, the
formula becomes:

```
sum(perKategori) + tautanBucket.kebutuhan === total.kebutuhan − unplaced.kebutuhan
```

This is because link figures carry **no per-category breakdown of their own** —
the detail lives in the target file and only the aggregate crosses the boundary.
They are therefore collected into a synthetic `__tautan__` bucket (label
"Tautan") that sits outside `cfg.kategori` but inside the identity. Instance
figures (doc 15) do carry real category breakdowns (via their positions'
`kategoriId`) and fold through `buildPerKategori` normally — no synthetic bucket
needed for them.

The identity test must account for all three contributions:

| Source | Bucket | Counted in `perKategori`? |
|---|---|---|
| Own-tree jabatan rows | Real `kategoriId` bucket | ✅ Yes |
| Link node figures | `__tautan__` synthetic bucket | ✅ Yes (added in Stage B) |
| Template instance figures | Real `kategoriId` bucket (via position) | ✅ Yes |
| Unit `subtreeTotals` | No bucket (aggregate only) | ❌ No |

The Stage B `buildPerKategori` therefore seeds an additional `__tautan__` key
alongside the taxonomy categories, and populates it from `linkTotals` for every
link node in scope.

### Per-unit breakdown

```ts
function buildPerUnit(project, idx, subtreeTotals): RecapBucket[] {
  return project.nodes
    .filter(n => n.type === 'unit')
    .sort((a, b) => compareNomor(a.nomor, b.nomor))
    .map(u => ({
      key: u.id,
      label: u.nama,
      ...subtreeTotals.get(u.id)!,
      nodeCount: countPositions(subtreeIds(u.id, idx)),
      depth: depthOf(u.id),                    // for indented rendering
    }));
}
```

Every unit gets a row, at every level. This means figures appear more than once
across rows — a sub-division's numbers are also inside its division's numbers.
**Per-unit rows must never be summed by the reader**, so the panel renders them
indented as a hierarchy, not as a flat table with a total row. A flat list of unit
rows invites exactly the wrong mental arithmetic.

### Per-category and per-level breakdowns

These count **own rows only**, never subtree aggregates — otherwise every position
would be counted once for itself and again inside each ancestor unit.

```ts
function buildPerKategori(project, cfg, nodeTotals, idx, root): RecapBucket[] {
  const inScope = new Set(root ? subtreeIds(root.id, idx) : []);
  const acc = new Map<string, { keb: number; eks: number; n: number }>();

  // Seed every configured category so zero buckets still appear —
  // "Pelaksana: 0" is information, a missing row is ambiguous.
  for (const k of cfg.kategori) acc.set(k.id, { keb: 0, eks: 0, n: 0 });
  acc.set('__tanpa_kategori__', { keb: 0, eks: 0, n: 0 });

  for (const n of project.nodes) {
    if (n.type !== 'jabatan' || !inScope.has(n.id)) continue;
    const key = n.kategoriId && acc.has(n.kategoriId) ? n.kategoriId : '__tanpa_kategori__';
    const t = nodeTotals.get(n.id)!;
    const b = acc.get(key)!;
    b.keb += t.kebutuhan; b.eks += t.eksisting; b.n += 1;
  }

  return [...acc].map(([key, b]) => ({
    key,
    label: key === '__tanpa_kategori__' ? 'Belum berkategori' : getKategori(key)!.nama,
    kebutuhan: b.keb, eksisting: b.eks, selisih: b.eks - b.keb, nodeCount: b.n,
  })).filter(b => b.nodeCount > 0 || b.key !== '__tanpa_kategori__');
}
```

`perKategori` therefore sums exactly to `total` minus unplaced. That identity is
worth asserting in a test — it is the single strongest check that the aggregation
is right.

Per-level is the same shape, keyed on `jenjangId` at row granularity:

```ts
function buildPerJenjang(project, cfg, idx, root): RecapBucket[] {
  const inScope = new Set(root ? subtreeIds(root.id, idx) : []);
  const acc = new Map<string, { keb: number; eks: number; n: number }>();

  for (const n of project.nodes) {
    if (n.type !== 'jabatan' || !inScope.has(n.id)) continue;
    for (const r of n.rincian) {
      if (!r.jenjangId) continue;              // unlabeled rows appear only in perKategori
      const b = acc.get(r.jenjangId) ?? { keb: 0, eks: 0, n: 0 };
      b.keb += r.kebutuhan; b.eks += r.eksisting; b.n += 1;
      acc.set(r.jenjangId, b);
    }
  }

  return orderByConfig([...acc], cfg).map(([id, b]) => ({
    key: id, label: jenjangLabel(id),
    kebutuhan: b.keb, eksisting: b.eks, selisih: b.eks - b.keb, nodeCount: b.n,
  }));
}
```

Only levels actually used appear here — unlike categories, the full ladder would be
mostly zeros and would bury the real content. And note `nodeCount` here counts
*rows*, not nodes; the panel labels the column accordingly.

---

## 3. Memoization

The recap recomputes on every figure edit, so it must be cheap and must not
recompute on position changes.

```ts
const figuresKey = (nodes: OrgNode[]) =>
  nodes.map(n => `${n.id}:${n.kategoriId ?? ''}:${n.rincian.map(r =>
    `${r.jenjangId ?? ''},${r.kebutuhan},${r.eksisting}`).join('|')}`).join(';');

const recapKey = (p: Project) => `${structuralKey(p.nodes, p.edges)}#${figuresKey(p.nodes)}`;

const useRecap = () => {
  const project = useProjectStore(s => s.project);
  return useMemo(() => project ? computeRecap(project, taxonomy) : null,
                 [project && recapKey(project)]);
};
```

The key deliberately excludes `position`, `nama`, `keterangan`, and `custom` —
dragging a node and typing a description must not trigger aggregation.

`figuresKey` itself is O(rows) string building on every render. At 500 nodes that's
a few thousand characters — cheaper than the traversal it guards, but if profiling
shows it hot, replace it with an incrementing `figuresRevision` counter bumped by
`updateRincian`, `addRincian`, `removeRincian`, `setKategori`, and `setRumpun`.
Start with the key; it can't go stale, which a manual counter can.

---

## 4. Panel rendering

```
┌─ REKAPITULASI ──────────────────────┐
│                  Keb   Eks    Sel   │
│ TOTAL OPD        248   201    −47   │
│ Belum ditempatkan  6     2     −4   │   only when > 0
├─ PER UNIT ──────────────────────────┤
│ Sekretariat       42    38     −4   │
│  ├ Sub Bag Umum   14    13     −1   │
│  └ Sub Bag Keu    11    10     −1   │
│ Bidang Dikdas     67    52    −15   │
├─ PER KATEGORI ──────────────────────┤
│ Struktural        18    17     −1   │
│ Fungsional       156   121    −35   │
│ Pelaksana         74    63    −11   │
│ Belum berkategori  0     0      0   │   only when nodeCount > 0
├─ PER JENJANG ───────────────────────┤
│ Ahli Madya        12     9     −3   │
│ Ahli Muda         48    37    −11   │
│ Ahli Pertama      71    58    −13   │
│ Terampil          25    17     −8   │
└─────────────────────────────────────┘
```

Rendering rules that carry meaning:

- Per-unit rows are **indented, not flat**, and there is no subtotal line under
  them — the hierarchy makes it visually obvious the numbers nest.
- `selisih` is color-coded: negative red, zero neutral, positive amber. Positive is
  amber rather than green because over-establishment is also a finding worth
  noticing, not a success.
- Clicking a unit row focuses that node on canvas (`focusNode`, doc 05 §6). This is
  what makes the panel a navigation tool as well as a report.
- Sections collapse; state persists in `ui`, not the project.
- `Belum ditempatkan` and `Belum berkategori` appear only when non-zero, so a clean
  project shows a clean panel.

---

## 5. Edge cases

**No root.** `total` is zero and every node lands in `unplaced`. Correct, and
`NODE_NO_ROOT` explains it. The panel shows a hint pointing at the readiness check
rather than an unexplained zero.

**Unit with unit children only, no positions.** Aggregates to zero. Legitimate
(structure defined before positions are entered), and `nodeCount: 0` shows why the
row is empty.

**Position directly under the root, not inside any unit.** Counted in `total` and
in `perKategori`, but appears in no `perUnit` row. Per-unit rows therefore do not
sum to `total` — which is why they are rendered as a hierarchy under the total
rather than as a table that looks summable.

**Duplicate levels on one node.** Both rows are summed. The total is arithmetically
right but probably not what was meant; `JENJANG_DUPLICATE` covers it. The recap does
not deduplicate — silently dropping a row would make the panel disagree with the
property editor.

**Unlabeled row on a functional position.** Included in `total` and `perKategori`,
absent from `perJenjang`. So per-level figures can be less than the functional
category figure. `JENJANG_MISSING` flags the cause, and the panel notes the
discrepancy when it occurs rather than letting the operator discover it as an
apparent bug.

**Cyclic imported data.** Post-order traversal without a visited set would not
terminate. The visited set is mandatory, not defensive.

---

## 6. Exit criteria

- [ ] `computeRecap` is one post-order pass; instrumented call count is O(N)
- [ ] **Stage A identity test:** `sum(perKategori) === total − unplaced` asserted
      on a fixture with mixed categories, nested units, and unlabeled rows.
      This must hold without any link nodes or template instances in scope.
- [ ] **Stage B identity test:** on a fixture with link nodes and template
      instances, `sum(perKategori) + tautanBucket.kebutuhan === total.kebutuhan − unplaced.kebutuhan`
      (and likewise for `eksisting`). The `__tautan__` bucket appears in
      `perKategori` only when at least one link node is in scope.
- [ ] `subtreeTotals(root) === total`
- [ ] Unit `nodeTotals` are zero for every unit (invariant 1 holds end to end)
- [ ] Recap does not recompute on node drag (instrumented)
- [ ] Recap does not recompute on name or custom-attribute edits
- [ ] Recap recomputes within one frame of a figure edit at 500 nodes
- [ ] Zero-count categories appear; zero-count levels do not
- [ ] Per-unit rows render indented with no summable subtotal line
- [ ] Clicking a unit row focuses that node
- [ ] `unplaced` shown separately from `total`, hidden when zero
- [ ] Traversal terminates on a cyclic fixture
