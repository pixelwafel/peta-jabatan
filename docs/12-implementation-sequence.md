# 12 — Implementation Sequence

## Purpose

Build order, dependencies, and what "done" means at each stage. The order is
deliberate: each milestone ends somewhere the work can be shown to a real operator
and the next milestone can be reordered based on what they say.

---

## Dependency graph

```
M0  Scaffold ──┬─▶ M1  Data & State ──┬─▶ M2  Canvas ──┬─▶ M4  Recap
               │                      │               │
               └─▶ M1b Config         └─▶ M3  Property │
                                                       │
                        M5  Persistence ◀──────────────┤
                                                       │
                        M6  Export ◀───────────────────┤
                             │
                        M7  Import ◀── (needs M6's column spec)
                             │
                        M8  Validation & Readiness
                             │
                        M9  Polish & Hardening
```

**M6 before M7** is the one non-obvious ordering. The column spec (doc 09 §1) is
shared, and writing the exporter first means the importer has real files to parse
during development instead of hand-authored fixtures. It also means the round trip
is testable from the day the importer exists, rather than being discovered broken
at the end.

---

## M0 — Scaffold

Vite + React + TypeScript, Tailwind, path aliases, ESLint/Prettier, Vitest.
Directory structure per doc 00 §18. Shell layout (doc 11 §1) with placeholder
panels. App version injected at build time.

**Exit:** shell renders at 1366×768, sidebars collapse, `pnpm test` runs.

---

## M1 — Data model & state

Docs 01, 03.

Type definitions. Zod schemas. `StructureIndex` and the selector layer. Zustand
stores. `commit()` with Immer patches. History with coalescing. All project actions.
Numbering utilities.

Build this **headless and test-first.** It is the only part of the system where a
subtle bug is invisible in the UI and corrupts data silently — a patch-ordering
mistake in history produces wrong state three undos later, which is not something
manual testing finds.

**Exit criteria:** doc 01 §9 and doc 03 §6 in full, verified by tests with no UI.

Highest-risk items: inverse patch ordering in coalesced transactions, and structure
index invalidation during drag.

---

## M1b — Configuration

Doc 02. Can run parallel with M1.

`taxonomy.json`, resolver API, label-to-id maps.

**Exit:** doc 02 §9. Verify the level lists against current regulation before
proceeding — this blocks nothing technically but changing it later invalidates test
fixtures and any data already entered.

---

## M2 — Canvas

Doc 05.

React Flow wiring, store projection, node cards for all three variants, drag with
commit-on-stop, snap, multi-select, collapse, Dagre tidy with subtree scope, fit and
focus, keyboard shortcuts.

**Exit:** doc 05 §9.

**Performance gate before proceeding:** generate a 500-node fixture and verify pan,
zoom, and drag hold frame rate. A performance problem found here is a projection or
memoization fix; found in M9 it is a rewrite of everything built on top.

Highest-risk: `nodeHeight` diverging from CSS (breaks Tidy), and re-render storms
from a too-broad subscription.

---

## M3 — Property panel

Doc 06.

All field controls, the chip picker, detail row table, classification with cascade
confirmations, searchable parent dropdown, custom attribute rendering and schema
editor.

**Exit:** doc 06 §8.

This is the first milestone worth showing an operator. The chip picker resolves the
question that shaped the whole data model, and it is worth confirming it reads as
intended before more is built on it.

---

## M4 — Recap

Doc 07.

`computeRecap`, memoization, panel with all breakdowns, click-through to canvas.

**Exit:** doc 07 §12.

Assert `sum(perKategori) === total − unplaced` on a fixture with nested units,
positions directly under root, and unlabeled rows. That identity is the strongest
single check that the aggregation is right, and it catches the double-counting class
of bug that would otherwise ship.

---

## M5 — Persistence

Doc 10.

Storage layout, debounced autosave, quota handling, save indicator, migration
mechanism, project manager, export reminder, startup and recovery.

**Exit:** doc 10 §9.

Test the failure paths explicitly, by hand: fill the quota, corrupt a body, corrupt
the index, open two tabs, run in private browsing. These are the paths that lose an
operator's work, and none of them occur during normal development.

---

## M6 — Export

Doc 09.

`COLUMNS` spec, row generation, XLSX writer with formatting and validation, CSV with
BOM, PNG with bounds handling, filenames, export dialog.

**Exit:** doc 09 §9 minus the round-trip criterion, which needs M7.

Verify the `nomor` text-format round trip manually in Excel, LibreOffice, and WPS —
all three are in use in Indonesian offices, and this is the failure that silently
merges nodes.

---

## M7 — Import

Doc 08.

Template generator, column mapping, row parsing, coercion, grouping, structure
derivation, JSON import with repair, preview dialog, commit.

**Exit:** doc 08 §10, plus the round-trip criterion from doc 09.

Build a fixture set of deliberately broken files before writing the parser: missing
columns, reordered columns, title rows above the header, merged cells, `1.10`
collapsed to `1.1`, gaps in numbering, unit rows with figures, unknown levels,
thousands separators, 800 rows. The parser's quality is entirely a question of how it
handles these, and writing them first keeps the implementation honest.

Then have someone who did not build the tool fill the template from a printed
structure. Their mistakes are the specification for the findings list — the ones
worth reporting well are the ones a real operator actually makes.

---

## M8 — Validation & readiness

Doc 04.

`validateProject`, debounced live surfacing, status bar badge, node markers,
Unplaced panel with inline assignment, readiness dialog with grouping and
click-through.

**Exit:** doc 04 §7.

Validation comes late because it depends on everything it validates. The prevention
half — `canSetParent` — must ship in M1 with the state layer, since it is an
invariant rather than a report.

---

## M9 — Polish & hardening

Docs 11, plus accumulated debt.

Empty states, accessibility pass, reduced motion, PWA offline shell, error boundary
with a JSON-download recovery path, dev render-counter overlay, browser zoom check,
Indonesian copy review.

The copy review is not cosmetic. Every finding message and confirmation is read by
someone deciding whether their work is about to be destroyed, and awkward phrasing in
a destructive dialog is a functional defect.

**Exit:** doc 11 §11, and the full Definition of Done from doc 00 §23.

---

## Stage B — M10 through M12

**Hard gate:** M0–M9 (Stage A) must pass the full Stage A Definition of Done
before any Stage B milestone starts. Stage B features consume Stage A's files;
built earlier, they are tested against imagined data. The gate also produces
the fixture set Stage B needs: real exported projects.

One Stage A change forced by Stage B being in MVP at all: **M5 is built on
IndexedDB from the start** (doc 10 amendment). This is not deferrable to Stage
B — migrating operator data between storage backends later is exactly the kind
of work the early decision avoids.

### M10 — Link nodes (doc 13)

LinkRef on the model, resolution from the extended index, cycle guard, link
card, link panel with free-code entry, cache refresh, aggregate term in
`computeRecap`, XLSX `Tautan` rows, findings.

**Exit:** doc 13 §8. Fixture: `linked` — Dinkes + 3 Puskesmas, one deleted to
exercise the cached path.

### M11 — Dashboard & bulk import (doc 14)

`daftar-opd.json`, index extensions live end-to-end, card grid with nesting and
placeholders, double-count guard, comparison table, progressive category
breakdown, bulk import staging with all five statuses and one-generation
archive, project manager search/grouping/origin, consolidated XLSX export.

**Exit:** doc 14 §7. The zero-bodies-on-first-paint criterion is instrumented,
not eyeballed.

### M12 — Template-instance (doc 15)

`isTemplate` + `instances`, the column contract with validator enforcement,
instance grid (virtualized), aggregation via `instanceTotals` +
`instancesRevision`, matrix XLSX round trip with hidden-id row and label
fallback, cascade confirmations, findings.

**Exit:** doc 15 §7. This is the largest single milestone in the project —
comparable to the import pipeline — and it is last deliberately: it touches
recap, export, import, canvas, and the panel, all of which must be stable
first.

Fixtures added for Stage B: `linked` (above), `template-sekolah` (one template,
300 generated instances, mixed levels), and `pemda` (12 projects spanning all
five bulk-import statuses plus two linked files).

**What to cut if Stage B runs long, in order:** consolidated XLSX export, the
progressive category breakdown (cards and table alone still answer most
questions), long-format matrix import. **What not to cut:** the double-count
guard (a wrong government total is worse than no dashboard), staleness display
on links, and the blast-radius confirmations on template column deletion.

## Testing strategy

| Layer | Approach |
|---|---|
| Selectors, numbering, recap, validation | Unit tests, fixture projects, no UI |
| History | Property-based: random action sequences, assert undo-all returns to initial state |
| Import | Fixture spreadsheets including the broken set |
| Round trip | Export → import → deep-equal on structure, figures, classification |
| Performance | 500-node fixture, instrumented render and rebuild counts |
| Failure paths | Manual: quota, corruption, two tabs, private browsing |

The property-based history test is worth the setup. Undo/redo bugs are combinatorial
and do not surface from scripted cases; "any sequence of N actions, then N undos,
returns to the initial state" catches the whole class.

---

## Fixtures to build early

Needed from M1 onward; building them once saves repeated hand-authoring.

| Fixture | Purpose |
|---|---|
| `minimal` | Root + 2 units + 5 positions |
| `realistic` | ~90 nodes modeled on an actual agency, mixed categories, functional levels |
| `large` | 500 nodes, generated |
| `pathological` | Cycles, duplicate ids, unit with figures, orphans, unknown levels |
| `broken-xlsx/*` | The deliberately broken spreadsheet set from M7 |

`realistic` is the one that earns its keep. Use it in every manual check; synthetic
fixtures hide the problems that come from real names, real depth, and real
distributions of functional levels.

---

## Sequencing notes

**What can run in parallel.** M1b with M1. Within M9, most items are independent. The
XLSX template generator (M6/M7) can be built early by anyone, since it depends only
on the config.

**What cannot be deferred.** The 500-node performance gate at M2. Patch-based
history in M1 — retrofitting it over snapshot history means rewriting every action.
`schemaVersion` and the migration mechanism in M5, before any operator file exists.

**What to cut if time runs short.** In order: CSV export (XLSX covers it), the
`Rekap` sheet in XLSX, subtree-scoped Tidy, keyboard shortcuts beyond undo/redo,
duplicate-subtree.

**What not to cut, under any pressure.** Import preview — without it the primary
entry path is worse than not having it. The export reminder — it mitigates the
tool's largest structural risk. Numbers on the readiness check — an unsupervised
operator with a silent tool sends a broken file. And `nomor` text formatting in XLSX,
which is one line preventing silent data corruption.

---

## Open items to resolve before or during M1b

1. **Verify the level lists** against the Permenpan in force. Blocks nothing
   technically; invalidates fixtures and entered data if changed later.
2. **Confirm the structural level vocabulary** post-delayering — whether JPT
   Pratama / Administrator / Pengawas is current, and whether echelon terms should
   appear as aliases for older files.
3. **Decide the initial custom attribute set** the Organization Bureau will
   distribute, so the template ships with real columns rather than an example.
4. **Confirm the agency code format** used locally, so `kodeOPD` validation and
   filenames match existing conventions.
5. **Decide whether `tahunAnggaran` is required.** It affects the filename
   convention and whether a project can be duplicated forward into a new year — a
   likely V1 request.
