# 13 — Link Nodes

## Purpose

Let a unit node reference another project — a Puskesmas under Dinas Kesehatan, a
UPTD under Dinas Perhubungan — contributing that file's totals to this file's
aggregates, while both files remain independently readable and editable.

---

## 1. Data

```ts
interface LinkRef {
  kodeOPD: string;               // stable identity of the target
  namaProject: string;           // display name, denormalized
  projectId?: string;            // local resolution hint; may be absent or wrong
  cached: {
    kebutuhan: number;
    eksisting: number;
    nodeCount: number;
    updatedAt: string;           // when the cache was captured
  };
}

// On OrgNode (doc 01):
link?: LinkRef;
```

Rules:

- A link node is `type: 'unit'`, `rincian: []` (invariant 1 unchanged), and has
  **no hierarchy children**. Link and children are mutually exclusive —
  converting a unit with children to a link requires deleting or moving them
  first, with a confirmation naming the count.
- `kodeOPD` is the identity, not `projectId`. Files travel between browsers;
  local ids don't survive the trip, codes do.
- Links are one-directional. The target file carries no back-reference.

---

## 2. Resolution

> **Sync/async design note.** `resolveLink` is **synchronous** in practice,
> despite what the original `async` signature might imply. It reads only from
> `index.entries`, which is an in-memory JavaScript array loaded at startup —
> no IndexedDB I/O happens here. This is essential: `computeRecap` (doc 07 §2b)
> is synchronous; a link resolution that needed to `await` an IDB read would
> make the entire recap async and require an async React rendering path that is
> significantly more complex.
>
> The only async operation associated with links is the **cache refresh write**
> (committing updated `link.cached` figures back to the project), which happens
> after resolution as a fire-and-forget side effect, not as part of the resolution
> itself.

```ts
interface ResolvedLink {
  status: 'live' | 'cached' | 'unresolved';
  totals: NodeTotals;
  nodeCount: number;
  asOf: string;                  // date the figures are from
  targetProjectId?: string;      // when live: for click-through
}

// Synchronous — reads only from the in-memory index, no I/O.
function resolveLink(ref: LinkRef, index: ProjectIndex): ResolvedLink {
  const entry = index.entries.find(e => e.kodeOPD === ref.kodeOPD)
             ?? (ref.projectId ? index.entries.find(e => e.id === ref.projectId) : undefined);

  if (!entry) {
    return ref.cached.updatedAt
      ? { status: 'cached', totals: cachedTotals(ref), nodeCount: ref.cached.nodeCount, asOf: ref.cached.updatedAt }
      : { status: 'unresolved', totals: ZERO, nodeCount: 0, asOf: '' };
  }

  // Live: totals come from the index (doc 10 §1), not by opening the body.
  const resolved: ResolvedLink = {
    status: 'live',
    totals: { kebutuhan: entry.totalKebutuhan, eksisting: entry.totalEksisting,
              selisih: entry.totalEksisting - entry.totalKebutuhan },
    nodeCount: entry.nodeCount, asOf: entry.updatedAt, targetProjectId: entry.id,
  };

  // Cache refresh: fire-and-forget async side effect — NOT part of resolution.
  // Writes resolved figures back into link.cached via a transient commit.
  void scheduleCacheRefresh(ref, resolved);

  return resolved;
}
```

Resolving from the **index** rather than the project body is what keeps a file
with 28 links cheap to open. The index already carries the totals (doc 10 §1,
extended); no body is deserialized.

The `index` argument is passed in (rather than accessed via a global) to make
the function pure and testable: tests can construct a minimal `ProjectIndex`
fixture without setting up the full store.

**Cache refresh** happens after resolution: `scheduleCacheRefresh` enqueues a
`transient` commit (no history entry — the operator didn't do anything) that
writes the resolved figures into `link.cached`. Decoupled from resolution so
it does not block the synchronous recap computation. This way the file that gets
exported always carries the freshest figures this browser has seen.

**Duplicate `kodeOPD` in storage** (two versions of the same Puskesmas file):
resolve to the most recently updated, and emit `LINK_AMBIGUOUS` (info) naming
both, so the operator can delete the stale one.

### Cycle guard

A links B, B links A — the totals would be circular. Enforced at link-creation:
walk the target's links (from stored bodies' link lists, kept in the index as
`linkedCodes: string[]`) and refuse a selection that reaches back to the current
project's `kodeOPD`. Depth-capped at 10. Because resolution reads only cached
index totals, a cycle that slips in via hand-edited files degrades to stale
numbers rather than infinite recursion — but the guard plus a `LINK_CYCLE`
finding on load keeps it visible.

---

## 3. Aggregation

The single change to the recap formula (doc 07 §2b):

```
subtreeTotals(unit) = Σ own-tree descendant rows
                    + Σ resolveLink(child).totals   for link-node children
```

Link totals are memoized per recap computation. The recap panel and any unit
aggregate that includes cached (non-live) link figures is marked — a small
clock glyph with the oldest `asOf` date in its tooltip. Mixed-freshness numbers
without a trace are how trust in the recap dies.

---

## 4. Canvas card

```
┌────────────────────────────┐
│ ⧉ PUSKESMAS KOTA TIMUR     │
│ ────────────────────────── │
│ Keb 52 · Eks 47 · −5       │
│ 41 node · per 14 Jul ⚠     │    ⚠ only when stale or unresolved
└────────────────────────────┘
```

- `⧉` glyph and a distinct border mark it as a reference
- Live: no date shown (it's current). Cached: `per <date>`. Stale (older than
  30 days): amber. Unresolved: `angka tidak tersedia`, red-tinted.
- No collapse chevron — there are no children
- Double-click opens the target project when live; when cached, shows a dialog
  explaining the file isn't in this browser and offering import

Link nodes are excluded from Dagre's *interior* but included as leaf boxes —
they occupy layout space like any childless unit.

---

## 5. Property panel

Selecting a link node shows, instead of the children/figures sections:

```
├─ TAUTAN ───────────────────────┤
│ Kode        PKM-KTIM           │
│ Project     [Puskesmas Kota…▾] │   dropdown over stored projects + free entry
│ Status      ● Live             │
│ Angka       Keb 52 · Eks 47    │
│ Per         hari ini           │
│ [Buka project]  [Putuskan]     │
└────────────────────────────────┘
```

- The dropdown lists stored projects by name and code; choosing one fills
  `kodeOPD`/`namaProject`. Free entry of a code is allowed for files that
  haven't arrived yet — the link starts `unresolved` and resolves when the file
  is imported. This ordering matters: the Dinas file is often built before all
  28 Puskesmas files exist.
- **Putuskan** (unlink) converts back to an ordinary empty unit, confirming
  that cached figures will be dropped from aggregates.

Creating a link: an ordinary unit's panel gains a "Jadikan tautan…" action,
available only when the unit has no children.

---

## 6. Interchange

**JSON** carries `link` verbatim, including the cache — that is the point: the
exported Dinas file is self-sufficient.

**XLSX/CSV**: a link node exports as one row, `tipe` column value `Tautan`,
figures from its resolved totals, plus a `kode_tautan` column. On import, a
`Tautan` row becomes a link node with the figures written into `cached` and
`updatedAt` set to the import time. The child file's contents never pass
through the parent's spreadsheet.

**Consolidated numbering** (dashboard export, doc 14): a link node's `nomor`
prefixes the target file's numbering — link `1.4` makes the target's `1.1`
appear as `1.4.1.1` in the consolidated workbook. Computed at export; nothing
is renumbered in either file.

---

## 7. Validation

| Code | Severity | Condition |
|---|---|---|
| `LINK_UNRESOLVED` | warning | No cache and no stored target |
| `LINK_STALE` | info | Cached, `asOf` older than 30 days |
| `LINK_AMBIGUOUS` | info | Two stored projects share the `kodeOPD` |
| `LINK_CYCLE` | error | Load-time detection of a reference cycle |
| `LINK_HAS_CHILDREN` | error | Corrupted state: link and children coexist |

---

## 8. Exit criteria

- [ ] Link resolves live from the index without deserializing the target body
- [ ] Deleting the target flips the card to cached-with-date, not zero
- [ ] Cache refreshes on live resolution via a transient commit (no history entry)
- [ ] Link + children mutually exclusive; conversion paths confirm with counts
- [ ] Cycle refused at creation; `LINK_CYCLE` fires on a hand-crafted cyclic pair
- [ ] Recap rows containing cached figures carry the freshness marker
- [ ] `kodeOPD` free entry creates an unresolved link that resolves on later import
- [ ] Unlink confirms and restores an ordinary unit
- [ ] XLSX round trip: `Tautan` row → link node with import-time cache
- [ ] Consolidated numbering prefixes correctly on a two-file fixture
