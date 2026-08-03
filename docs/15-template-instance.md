# 15 — Template-Instance Units

## Purpose

Handle hundreds of work units that share one structure but each need their own
figures — the school case. The structure exists once on the canvas; the figures
live in an instance table, one row per school, at **position × school × level**
granularity. 300 SD × 15 positions stays a 16-node canvas with a 300-row table,
not a 4,500-node diagram or 300 files.

---

## 1. Data

```ts
// On OrgNode (doc 01):
isTemplate?: boolean;            // meaningful only on type === 'unit'

// On Project (doc 01):
instances?: UnitInstance[];

interface UnitInstance {
  id: string;                    // uuid
  templateNodeId: string;        // the isTemplate unit
  nama: string;                  // 'SDN 01 Kota Timur'
  kode?: string;                 // NPSN or local code
  figures: Record<string /* rincianId */, { kebutuhan: number; eksisting: number }>;
  keterangan?: string;
}
```

### The column contract

Inside a template subtree, the position nodes and their detail rows are
**column definitions**, not data:

- Position children define *which positions exist per school*
- Each position's `rincian` rows define *which levels exist* — the chip picker
  works unchanged
- The stored `kebutuhan`/`eksisting` on those rows are **always 0**
  (invariant; validator-enforced as `TEMPLATE_ROW_HAS_FIGURES`, error)
- Real figures live in `instance.figures`, keyed by `rincianId`

Keying on `rincianId` rather than position id is what preserves per-level
granularity: a Guru Kelas with Ahli Pertama and Ahli Muda rows yields two
columns per school, and the government-wide per-jenjang recap stays exact.

### Constraints

- A template unit cannot also be a link, and cannot sit inside another template
  subtree (no nesting — `TEMPLATE_NESTED`, error)
- Unit children *are* allowed inside a template subtree (a school with a Tata
  Usaha sub-unit), and their positions' rows are columns like any other
- Instances with figures keyed to a deleted `rincianId` keep the orphan data,
  flagged `INSTANCE_ORPHAN_FIGURES` (warning) — never silently dropped

---

## 2. Editing lifecycle

**Marking.** A unit's property panel gains "Jadikan template…". If its subtree
already carries figures, conversion offers: seed one instance from the existing
figures (named after the unit), or zero them — stated with the totals, never
silent. Unmarking reverses: with >1 instance, refuse until instances are
resolved (exported or deleted); with exactly one, offer to fold its figures
back into the rows.

**Structure edits cascade with confirmation.** Deleting a detail row (or a
position, or deactivating a level chip) inside a template subtree deletes that
column across all instances. The confirmation names the blast radius:
*"Menghapus jenjang Ahli Muda pada Guru Kelas akan menghapus angka pada 300
satuan (total kebutuhan 1.850)."* Adding rows/positions is free — new columns
start empty everywhere.

**Instance table.** Selecting a template unit switches the center pane from
canvas to a virtualized grid:

```
Satuan ▾            Kepsek   Guru Kelas        PJOK    …
                     K  E    AP K/E  AMu K/E   K  E
SDN 01 Kota Timur  [ 1][1]  [ 4][3] [ 2][2]  [ 1][1]
SDN 02 Kota Timur  [ 1][0]  [ 5][5] [ 1][1]  [ 1][1]
＋ Tambah satuan
```

Column groups per position, sub-columns per level (`singkatan` headers), fixed
first column, virtualized rows. Cell edits go through `commit` with per-cell
txIds (doc 03 coalescing applies). Row add/duplicate/delete as usual; delete
confirms with the row's totals.

The grid is the *correction* surface. The *filling* surface is Excel — the grid
must be good enough to fix ten cells, and does not need to be good enough to
enter 4,500.

---

## 3. Aggregation

The third term of the doc 07 §2b formula:

```
templateColumnTotal(rincianId) = Σ over instances figures[rincianId]
nodeTotals(position in template) = Σ its rows' column totals
subtreeTotals(template unit)     = Σ position totals  (+ sub-unit recursion)
```

One pass over `instances` builds a `Map<rincianId, {keb, eks}>`; the ordinary
bottom-up walk then reads position totals from it instead of from stored row
figures. Memo key gains an `instancesRevision` counter (the figures-hash
approach would serialize 4,500 cells per render — here the counter is the right
tool, unlike doc 07 §3's base case).

Recap additions: the template unit's per-unit row shows `300 satuan` in place
of a node count; per-category and per-jenjang fold template columns through the
position's classification exactly as if the figures were on the rows.

**`buildPerKategori` delta for template figures.** The standard
`buildPerKategori` reads figures from `nodeTotals` (which holds own-row sums
from stored `rincian`). For positions inside a template subtree, stored rincian
figures are zero by invariant 12 — the real figures live in `instanceTotals`.

The delta is a single guard inside the inner loop:

```ts
for (const n of project.nodes) {
  if (n.type !== 'jabatan' || !inScope.has(n.id)) continue;

  // Use instance totals for template-subtree positions; stored totals otherwise.
  const t = isInTemplateSubtree(n.id, idx, templateUnitIds)
    ? instanceTotals.get(n.id) ?? ZERO
    : nodeTotals.get(n.id)!;

  const key = n.kategoriId && acc.has(n.kategoriId) ? n.kategoriId : '__tanpa_kategori__';
  const b = acc.get(key)!;
  b.keb += t.kebutuhan; b.eks += t.eksisting; b.n += 1;
}
```

`isInTemplateSubtree` is a pre-built Set of node ids that are descendants of any
`node.isTemplate === true` unit — built once before the loop at O(N) cost.
`instanceTotals` is the same map already built for the subtree walk (doc 07 §2b).
No new data structure is needed; both are passed as arguments from `computeRecap`.

**Canvas cards** inside a template subtree show the summed column totals with a
`Σ 300 satuan` marker line, and the template unit's card carries a distinct
badge. Figures on these cards are read-only by definition — the property panel
for a template-subtree position shows its rows as column definitions with the
chip picker active but the number inputs replaced by per-column totals linking
to the grid.

---

## 4. XLSX interchange

A template unit adds one matrix sheet per template to the workbook, named
`Satuan_<nomor>`:

```
row 1:  satuan  | kode  | Kepala Sekolah |        | Guru Kelas |       |      |
row 2:          |       | K      | E     | AP·K | AP·E | AMu·K | AMu·E |
row 3+: SDN 01… | 20112 | 1      | 1     | 4    | 3    | 2     | 2
```

Two-row header: position names spanning their column group, then
`level·K`/`level·E` sub-headers (or bare `K`/`E` for single-row positions).
Hidden row 0 carries `rincianId` keys so re-import maps columns exactly even if
labels were edited; when the hidden row is missing (hand-built file), fall back
to matching position name + level label via the doc 02 resolvers, tolerantly.

On the main `Struktur` sheet, the template subtree appears with a `template`
marker column and zero figures — structure travels there, figures travel in the
matrix sheet.

Import preview (doc 08) gains a per-matrix summary — instance count, column
count, totals, unmatched-column findings with their header text — and the same
commit rules. A matrix referencing a template `nomor` absent from `Struktur` is
fatal for that sheet only.

Long-format is also accepted on import (`satuan, nomor, jenjang, kebutuhan,
eksisting`) for data coming out of other systems; export always writes the
matrix.

---

## 5. Validation

| Code | Severity | Condition |
|---|---|---|
| `TEMPLATE_ROW_HAS_FIGURES` | error | Non-zero figures on rows inside a template subtree |
| `TEMPLATE_NESTED` | error | Template unit inside a template subtree |
| `TEMPLATE_NO_INSTANCES` | warning | Marked template, zero instances |
| `TEMPLATE_LINK_CONFLICT` | error | `isTemplate` and `link` on one node |
| `INSTANCE_ORPHAN_FIGURES` | warning | Figures keyed to a deleted `rincianId` |
| `INSTANCE_NAMA_DUPLICATE` | warning | Two instances share a name |
| `INSTANCE_ALL_ZERO` | info | An instance with every cell zero |

---

## 6. Edge cases

**One template, two schools types?** Different structures (SD vs SMP) are
different template units side by side under the same parent — never one
template with optional columns. The model stays simple; the canvas shows two
small subtrees.

**Instance count beyond the grid's comfort.** Virtualization targets 1,000
rows. Above that, the tool is being used outside its design and says so — the
same posture as the 500-node canvas limit.

**Undo across matrix import.** Matrix import replaces that template's instances
atomically inside one `commit`, so it is one undo step — unlike whole-file
import, it does not clear history.

**Sorting/filtering the grid** is UI state only, never reorders `instances` —
export order is instance order, kept stable so diffs between successive exports
stay readable.

---

## 7. Exit criteria

- [ ] Rows in a template subtree hold zero figures; validator enforces
- [ ] Chip picker on a template position adds/removes columns across all
      instances, with blast-radius confirmation on removal
- [ ] `rincianId` keying preserves per-jenjang recap exactness on a fixture with
      two-level Guru columns
- [ ] Canvas cards show summed totals with the instance-count marker
- [ ] Grid virtualized; 300 rows edit smoothly; cell edits coalesce in history
- [ ] Matrix export → Excel edit → re-import round-trips 300 instances exactly,
      including via the hidden-id row and via label fallback
- [ ] Matrix import is one undo step and does not clear history
- [ ] Deleting a column with data confirms naming instance count and totals
- [ ] Orphan figures flagged, never dropped
- [ ] Recap, dashboard, and consolidated export all reflect instance sums with
      no double count
