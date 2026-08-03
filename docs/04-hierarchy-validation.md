# 04 — Hierarchy & Validation

## Purpose

Derive the tree from edges, make cycles unrepresentable rather than detectable,
and produce a findings list that tells an unsupervised operator what to fix.

---

## 1. Tree derivation

Hierarchy is edges, never coordinates. All traversal reads the `StructureIndex`
from doc 01 §5.

```ts
function buildTree(): TreeNode[] {
  const idx = structureIndex();
  const roots = rootNodes();

  const walk = (id: string, depth: number, seen: Set<string>): TreeNode => {
    seen.add(id);
    const children = (idx.childIds.get(id) ?? [])
      .filter(cid => !seen.has(cid))          // defensive; see §2
      .map(cid => walk(cid, depth + 1, seen));
    return { id, children: sortSiblings(children), depth };
  };

  return roots.map(r => walk(r.id, 0, new Set()));
}
```

The `seen` guard should never fire, because §2 makes cycles impossible. It stays
anyway: a corrupted imported file could carry one, and an infinite recursion in a
render path is a white screen with no diagnostic.

### Sibling order

A free-form canvas gives no inherent sibling order. The tree sidebar needs one and
it must be stable.

```ts
const sortSiblings = (nodes: TreeNode[]) => nodes.sort((a, b) => {
  const A = nodeById(a.id), B = nodeById(b.id);
  const byNomor = compareNomor(A.nomor, B.nomor);
  if (A.nomor && B.nomor && byNomor !== 0) return byNomor;
  const byX = A.position.x - B.position.x;      // left to right on canvas
  if (Math.abs(byX) > 8) return byX;            // tolerance: near-aligned is a tie
  return A.nama.localeCompare(B.nama, 'id');
});
```

Priority: `nomor` when both have one, then canvas x-position, then name. The 8px
tolerance prevents the tree from reordering on a 2px accidental nudge.

---

## 2. Cycle prevention

Cycles are prevented at the interaction layer. There is no cycle repair path
because there is no way to create one.

```ts
function canSetParent(childId: string, parentId: string): boolean {
  if (childId === parentId) return false;
  const idx = structureIndex();
  // Walk up from the proposed parent; if we meet the child, this would close a loop.
  let cursor: string | undefined = parentId;
  const guard = new Set<string>();
  while (cursor) {
    if (cursor === childId) return false;
    if (guard.has(cursor)) return false;        // pre-existing corruption
    guard.add(cursor);
    cursor = idx.parentId.get(cursor);
  }
  return true;
}
```

O(depth), not O(N) — walking up is cheap even in a deep structure.

**Every entry point routes through it:**

| Entry point | Enforcement |
|---|---|
| Parent dropdown (06) | Invalid options excluded from the list, not disabled |
| `setParent` action (03) | Early return on false |
| Tree drag reparenting (V1) | Drop target rejected, no drop indicator shown |
| JSON import (08) | Cycles detected on load, offered as edge-drop repair |

Excluding rather than disabling matters. A dropdown of 400 positions with 30
greyed out is worse than a dropdown of 370 valid ones — the operator cannot tell
disabled-for-cycle from disabled-for-something-else.

```ts
function validParentOptions(childId: string): OrgNode[] {
  return nodes()
    .filter(n => n.id !== childId && canSetParent(childId, n.id))
    .sort((a, b) => compareNomor(a.nomor, b.nomor) || a.nama.localeCompare(b.nama, 'id'));
}
```

---

## 3. Findings engine

One pure function, no store access, fully testable.

```ts
function validateProject(project: Project, cfg: Taxonomy): Finding[]
```

Purity is the point: the readiness check, the status bar badge count, and the
import preview all call it with different inputs and get consistent results.

### Rule table

| Code | Severity | Condition |
|---|---|---|
| `META_OPD_MISSING` | error | `namaOPD` or `kodeOPD` empty |
| `NODE_NAMA_EMPTY` | error | `nama` blank after trim |
| `NODE_NO_PARENT` | warning | Not the designated root, no incoming hierarchy edge |
| `NODE_NO_ROOT` | error | No node qualifies as root |
| `NODE_MULTIPLE_ROOTS` | warning | More than one parentless node |
| `NODE_KATEGORI_MISSING` | warning | `type === 'jabatan'`, no `kategoriId` |
| `NODE_NOMOR_EMPTY` | info | `nomor` blank |
| `NODE_NOMOR_DUPLICATE` | warning | Same `nomor` on two nodes |
| `NODE_NOMOR_ORPHAN` | info | `parentNomor(nomor)` matches no node's `nomor` |
| `NODE_KODE_DUPLICATE` | warning | Same non-empty `kode` on two nodes |
| `UNIT_HAS_RINCIAN` | error | Invariant 1 violated |
| `JABATAN_NO_RINCIAN` | warning | `type === 'jabatan'`, `rincian` empty |
| `RINCIAN_ALL_ZERO` | info | Row with `kebutuhan === 0 && eksisting === 0` |
| `NODE_ALL_ZERO` | warning | Every row on the node is zero |
| `RINCIAN_NEGATIVE` | error | Negative figure |
| `JENJANG_INVALID` | warning | `!isJenjangValid(...)` — usually a config version gap |
| `JENJANG_DUPLICATE` | warning | Two rows with the same `jenjangId` on one node |
| `JENJANG_MISSING` | warning | Levels exist for the category but a row has `jenjangId === null` |
| `CUSTOM_REQUIRED_EMPTY` | warning | `wajib` attribute unfilled |
| `CONFIG_VERSION_MISMATCH` | info | `project.configVersion !== cfg.configVersion` |
| `UNIT_TANPA_KEPALA` | warning | Unit (non-link, non-template) with no structural-category child |
| `UNIT_BANYAK_KEPALA` | warning | Unit with more than one structural-category child |
| `LINK_UNRESOLVED` / `LINK_STALE` / `LINK_AMBIGUOUS` / `LINK_CYCLE` / `LINK_HAS_CHILDREN` | see doc 13 §7 | Link-node conditions |
| `TEMPLATE_ROW_HAS_FIGURES` / `TEMPLATE_NESTED` / `TEMPLATE_NO_INSTANCES` / `TEMPLATE_LINK_CONFLICT` / `INSTANCE_ORPHAN_FIGURES` / `INSTANCE_NAMA_DUPLICATE` / `INSTANCE_ALL_ZERO` | see doc 15 §5 | Template-instance conditions |

The unit-head pair encodes the doctrine from brief §4 (one unit, one head).
Both are warnings: real structures pass through headless states while being
built, and a plt/vacant arrangement is legitimate. Link and template nodes are
exempt — a link's head lives in the target file, and a template's heads live in
its instances.

`RINCIAN_ALL_ZERO` at `info` is the safety net promised in the brief for level rows
the operator activated but never filled. It is surfaced, never auto-removed —
deliberately recording zero is legitimate.

`NODE_ALL_ZERO` at `warning` catches the more likely mistake: a position that was
created and forgotten entirely.

### Implementation sketch

```ts
function validateProject(project, cfg): Finding[] {
  const f: Finding[] = [];
  const idx = buildIndex(project.nodes, project.edges);
  const roots = project.nodes.filter(n => !idx.parentId.has(n.id));
  const root = designatedRoot(project.nodes, project.edges);

  if (!project.meta.namaOPD?.trim() || !project.meta.kodeOPD?.trim())
    f.push({ code: 'META_OPD_MISSING', severity: 'error',
             message: 'Nama dan kode OPD belum diisi.' });

  if (roots.length === 0 && project.nodes.length > 0)
    f.push({ code: 'NODE_NO_ROOT', severity: 'error',
             message: 'Tidak ada node puncak. Struktur kemungkinan mengandung relasi melingkar.' });

  if (roots.length > 1)
    f.push({ code: 'NODE_MULTIPLE_ROOTS', severity: 'warning',
             message: `${roots.length} node tidak memiliki atasan. Satu menjadi puncak, ${roots.length - 1} lainnya belum ditempatkan.` });

  const byNomor = groupBy(project.nodes.filter(n => n.nomor), n => n.nomor);
  const byKode  = groupBy(project.nodes.filter(n => n.kode),  n => n.kode!);

  for (const n of project.nodes) {
    if (!n.nama.trim())
      f.push({ code: 'NODE_NAMA_EMPTY', severity: 'error', nodeId: n.id,
               message: 'Nama belum diisi.' });

    if (root && n.id !== root.id && !idx.parentId.has(n.id))
      f.push({ code: 'NODE_NO_PARENT', severity: 'warning', nodeId: n.id,
               message: `"${n.nama}" belum ditempatkan di bawah unit mana pun.` });

    if (n.type === 'unit' && n.rincian.length > 0)
      f.push({ code: 'UNIT_HAS_RINCIAN', severity: 'error', nodeId: n.id,
               message: 'Node unit tidak boleh memiliki angka sendiri.' });

    if (n.type === 'jabatan') {
      if (!n.kategoriId)
        f.push({ code: 'NODE_KATEGORI_MISSING', severity: 'warning', nodeId: n.id,
                 message: `Kategori jabatan "${n.nama}" belum dipilih.` });

      if (n.rincian.length === 0)
        f.push({ code: 'JABATAN_NO_RINCIAN', severity: 'warning', nodeId: n.id,
                 message: `"${n.nama}" belum memiliki baris angka.` });

      const opts = getJenjangOptions(n.kategoriId, n.rumpun);
      const seen = new Set<string>();
      let allZero = n.rincian.length > 0;

      for (const r of n.rincian) {
        if (r.kebutuhan < 0 || r.eksisting < 0)
          f.push({ code: 'RINCIAN_NEGATIVE', severity: 'error', nodeId: n.id,
                   message: 'Angka tidak boleh negatif.' });

        if (r.kebutuhan !== 0 || r.eksisting !== 0) allZero = false;
        else f.push({ code: 'RINCIAN_ALL_ZERO', severity: 'info', nodeId: n.id,
                      message: `Baris ${jenjangLabel(r.jenjangId)} pada "${n.nama}" masih nol.` });

        if (r.jenjangId) {
          if (seen.has(r.jenjangId))
            f.push({ code: 'JENJANG_DUPLICATE', severity: 'warning', nodeId: n.id,
                     message: `Jenjang ${jenjangLabel(r.jenjangId)} tercatat dua kali.` });
          seen.add(r.jenjangId);
          if (!isJenjangValid(n.kategoriId, n.rumpun, r.jenjangId))
            f.push({ code: 'JENJANG_INVALID', severity: 'warning', nodeId: n.id,
                     message: `Jenjang tidak sesuai kategori pada "${n.nama}".` });
        } else if (opts.length > 0) {
          f.push({ code: 'JENJANG_MISSING', severity: 'warning', nodeId: n.id,
                   message: `Baris pada "${n.nama}" belum diberi jenjang.` });
        }
      }

      if (allZero)
        f.push({ code: 'NODE_ALL_ZERO', severity: 'warning', nodeId: n.id,
                 message: `"${n.nama}" seluruh angkanya masih nol.` });
    }

    for (const a of project.attributeSchema.filter(a => a.wajib)) {
      const v = n.custom[a.id];
      if (v === undefined || v === null || v === '')
        f.push({ code: 'CUSTOM_REQUIRED_EMPTY', severity: 'warning', nodeId: n.id,
                 field: a.id, message: `${a.nama} belum diisi pada "${n.nama}".` });
    }
  }

  for (const [nomor, group] of byNomor)
    if (group.length > 1)
      f.push({ code: 'NODE_NOMOR_DUPLICATE', severity: 'warning', nodeId: group[0].id,
               message: `Nomor ${nomor} dipakai ${group.length} node.` });

  for (const [kode, group] of byKode)
    if (group.length > 1)
      f.push({ code: 'NODE_KODE_DUPLICATE', severity: 'warning', nodeId: group[0].id,
               message: `Kode ${kode} dipakai ${group.length} node.` });

  return f;
}
```

Note that messages name the node. `"Analis Kepegawaian" belum ditempatkan` is
actionable in a list of forty findings; `Node belum ditempatkan` is not.

---

## 4. Readiness Check

Same findings, grouped and framed as an outcome rather than a list.

```ts
interface ReadinessReport {
  ready: boolean;                    // no errors — warnings do not block
  groups: Array<{ code: string; severity: Severity; count: number; items: Finding[] }>;
  summary: { errors: number; warnings: number; infos: number };
}
```

Grouping by code is what makes forty findings readable. The dialog shows
*"12 jabatan belum ditempatkan"* as one collapsed row, expandable to the twelve
names, each clicking through to focus the node on canvas.

**`ready` is advisory.** Export proceeds regardless; the dialog offers *"Ekspor
tetap"* alongside *"Perbaiki dulu"*. An operator on a deadline with a known-partial
file must be able to send it. Blocking export would only teach them to distrust
the check.

Ordering: errors, then warnings, then infos; within a severity, by descending
count. The largest fixable problem sits at the top.

---

## 5. Live surfacing

Validation runs debounced (300 ms) after mutations, and the results appear in
three places:

| Surface | Content |
|---|---|
| Status bar | Error and warning counts as badges; click opens the readiness dialog |
| Node card | Small corner marker when that node has any finding; tooltip lists them |
| Unplaced panel | Nodes with `NODE_NO_PARENT`, listed with a Set-parent shortcut |

The Unplaced panel is not a generic findings list — it is a work queue for the one
finding that has a direct fix. Each row offers the parent dropdown inline, so
placing twelve stray positions is twelve dropdown selections without leaving the
panel.

---

## 6. Edge cases

**Every node is parentless (fresh import failure).** `NODE_MULTIPLE_ROOTS` fires
once with a count, not once per node. Forty identical findings communicate
nothing; one saying *"40 node tidak memiliki atasan"* points at a structural
problem — most likely a numbering column that failed to parse.

**Cycle in an imported file.** `rootNodes()` returns empty while nodes exist, so
`NODE_NO_ROOT` fires. The import path (doc 08 §6) offers to drop the edges forming
the cycle. Once loaded, cycles cannot arise.

**`nomor` duplicated during hand renumbering.** Warning only, never blocking —
renumbering necessarily passes through duplicate states. Debouncing keeps the
badge from flickering per keystroke.

**Validation cost at 500 nodes.** The function is O(N + E) with two grouping
passes. Well under a frame. If it ever isn't, memoize on the same structural key
the recap uses rather than optimizing the function.

**Node deleted while its finding is displayed.** Findings hold `nodeId`, not node
references. The renderer skips findings whose node no longer exists, and the next
debounced run clears them.

---

## 7. Exit criteria

- [ ] `validateProject` is pure — no store or config imports beyond the passed
      `cfg`
- [ ] `canSetParent` rejects self, direct parent cycles, and deep cycles
- [ ] Parent dropdown excludes rather than disables invalid options
- [ ] Every finding message names the node it concerns
- [ ] Duplicate-number and multiple-root findings are emitted once with a count,
      not per node
- [ ] `buildTree` terminates on a hand-crafted cyclic fixture
- [ ] Readiness dialog groups by code and click-through focuses the node
- [ ] Export remains available with `ready === false`
- [ ] Unplaced panel offers inline parent assignment
- [ ] Validation debounced at 300 ms; badge does not flicker during typing
