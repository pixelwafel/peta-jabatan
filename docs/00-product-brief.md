# 00 — Product Brief

**Version 4.0**

**Changes from v3:** MVP restructured into two stages, with everything previously
deferred to V1/V2 now in scope — link nodes, the government-wide recap dashboard,
bulk JSON import, and template-instance handling for schools. Unit-vs-head
conventions made explicit, with a combined-card rendering. Storage backend moves
from LocalStorage to IndexedDB, forced by multi-project volumes. Kelurahan
resolved as ordinary nodes inside per-Kecamatan files.

---

## 1. Product Summary

A frontend-only web application for composing the position maps of a local
government: each OPD (agency) as its own file on a free-form canvas, with
requirement and incumbent figures per position, live recapitulation, a
government-wide dashboard aggregating every file, and XLSX/JSON interchange.

Four things define the product:

1. **Free-form canvas.** Every node placed where the author wants; automatic
   layout is a button, not a constraint.
2. **Numbers attached to structure.** Figures live on nodes, so recapitulation
   can never drift from the diagram.
3. **Template as the primary entry point.** Structures built from the Excel
   files agencies already maintain.
4. **One file per work unit, one dashboard over all of them.** Technical units
   (Puskesmas, UPTD) are separate files referenced by link nodes; the dashboard
   reads every stored file and totals the government.

This is **not** an HR information system, **not** a job-analysis tool, and
**not** a general-purpose diagram editor.

---

## 2. Problem Statement

As v3 §2, plus one addition surfaced by the delegation model: consolidating
across an entire local government today means manually re-summing dozens of
inconsistent spreadsheets every time any one of them changes. The dashboard
exists to make that number a computed fact rather than a periodic project.

---

## 3. Users and File Ownership

**Primary — the Organization Bureau team**, who maintain most files and run the
dashboard. **Secondary — delegated agency operators** at high-unit-count
agencies (Health, Education, Transportation, Kecamatan), who maintain their own
files and hand them over as JSON.

| Holder | Files |
|---|---|
| Organization Bureau | ~35 small/medium OPD, plus every file received from operators |
| Health operator | Dinas Kesehatan + one file per Puskesmas |
| Education operator | Dinas Pendidikan, with schools as template-instances |
| Transportation operator | Dinas Perhubungan + UPTD/terminal files |
| Each Kecamatan operator | One file: kecamatan + all its kelurahan as ordinary nodes |

Consequences: taxonomy and attribute schema stay centralized (operators fill,
never define); every file carries `configVersion` and the app shows its own
version, because delegated operators run stale cached builds; and handover is
JSON via existing channels — still no backend.

---

## 4. Structural Doctrine

How real-world structures map onto the model. These are conventions the
validator enforces softly and the docs treat as normative.

**One unit, one head.** Every unit node should have exactly one child of
category Struktural — its head. Findings `UNIT_TANPA_KEPALA` and
`UNIT_BANYAK_KEPALA` flag deviations (warning, non-blocking).

**Non-structural positions attach to the unit node**, as siblings of the head —
never as children of the head. Totals would be identical either way; the
convention exists so `parent_nama` columns are consistent across thirty
operators' files.

**Combined card rendering.** When a unit has exactly one structural child, the
canvas renders them as one card — unit name, head name with its figures, and
the unit aggregate — matching conventional org charts. Data stays two nodes;
only presentation merges. A global toggle shows them separately.

**Technical units are separate files, referenced by link nodes.** A Puskesmas,
UPTD, or balai has its own structure, its own file, and appears in the parent
agency's file as a link node carrying cached totals. See §8.

**Kelurahan are ordinary nodes.** A kecamatan with all its kelurahan is
~100–200 nodes — under the design limit. One file per kecamatan; kelurahan as
unit nodes with ordinary position children. Duplicate-subtree makes replicating
the uniform kelurahan structure cheap. No link, no template machinery.

**Schools are template-instances.** Hundreds of schools sharing one structure
but each needing its own figures: the structure exists once on the canvas, the
figures live in an instance table, one row per school. See §9.

**Scope limit stated plainly:** the tool models position maps at the level of
agencies and self-standing work units. It does not model individual employees.

---

## 5. Scope — MVP in Two Stages

Stage A must fully pass its Definition of Done before Stage B begins. Stage B
features consume Stage A's outputs; building them earlier means testing them
against imagined files.

### Stage A — Core editor (unchanged from v3 MVP)

| Area | Features |
|---|---|
| Canvas | Free positioning, snap-to-grid, multi-select, zoom/pan/fit, collapse, combined unit-head card with toggle |
| Nodes | Add, edit, delete, duplicate, duplicate subtree |
| Hierarchy | Parent via searchable dropdown; one-head-per-unit conventions |
| Layout | Dagre tidy, whole canvas or subtree, undoable |
| Data | Detail rows with JF level chip picker; project-level custom attributes |
| Recap | Live panel: totals, per unit, per category, per level |
| History | 50-step undo/redo, patch-based |
| Storage | IndexedDB autosave, multi-project, last-saved indicator |
| Import | JSON; XLSX template with mandatory preview |
| Export | JSON, XLSX, CSV, PNG |
| Validation | Non-blocking findings + Readiness Check |

### Stage B — Multi-project layer

| Area | Features |
|---|---|
| Link nodes | Unit nodes referencing another project, with cached totals and staleness display (doc 13) |
| Dashboard | Government-wide read-only view: OPD cards, placeholders for missing agencies, comparison table, category breakdown (doc 14) |
| Bulk import | Drag many JSON files into the project list at once |
| Project manager | Search, grouping by kodeOPD, origin marking (own vs imported) |
| Template-instance | School-type units: structure once, figures per instance, matrix XLSX round trip (doc 15) |
| Config | `daftar-opd.json` — the expected-agency list driving dashboard placeholders |

### Out of scope entirely

Backend, database, login, multi-user editing, real-time collaboration, approval
workflow, permissions, task descriptions/ABK, per-employee data, PDF export
(post-MVP), search within canvas (post-MVP), coordination/guidance edge
rendering (post-MVP — the `kind` field exists from day one).

---

## 6. Key Architectural Decisions

1. **One file = one work unit** — an OPD, a Puskesmas, a kecamatan. Link nodes
   and the dashboard, not a mega-canvas, provide the wider views. There is no
   "load all children into one canvas" option, deliberately: the 500-node limit
   only holds if no button bypasses it.
2. **Two node types; classification is an attribute** (v3 §6, unchanged).
3. **Position and hierarchy are separate sources of truth** (unchanged).
4. **JSON to save and hand over; XLSX to move data** (unchanged).
5. **The dashboard is a view in the same app, not a separate app.** Same build,
   same taxonomy; the difference is what a given browser has stored. Read-only,
   recomputed on open — it cannot go stale.
6. **Storage is IndexedDB.** Multi-project volumes (40+ projects centrally,
   ~28 for the Health operator) exceed LocalStorage's ~5 MB. Same key
   structure, thin async wrapper; LocalStorage retains only UI preferences.
7. **Aggregates are not tree-only.** A unit's totals =
   descendant rows + linked-file cached totals + instance sums. Doc 07 §2b is
   the single formula; nothing else may assume descendants-only.

---

## 7. Data Model

As v3 §7 (two node types, two-tier classification from config, detail rows with
chip-picker levels, computed `selisih`, project-level custom attributes), with
three additions — canonical definitions in doc 01:

- `OrgNode.link?` — reference to another project with cached totals (doc 13)
- `OrgNode.isTemplate?` — marks a unit whose figures live in instances (doc 15)
- `Project.instances?` — the instance table for template units (doc 15)

All three are optional fields: Stage A files remain valid without migration.

New invariants: link graphs are acyclic (resolver-enforced); detail rows inside
a template subtree carry zero figures — they are column definitions, and real
figures live only in instances.

---

## 8. Link Nodes (summary — full spec doc 13)

A unit node may reference another project instead of having children. It stays
`type: 'unit'` with empty `rincian`; it carries the target's code, name, and a
`cached` block (totals, node count, `updatedAt`).

When the target project exists in this browser's storage, figures resolve live
and the cache refreshes. When it doesn't — the normal case for a file that has
traveled — the cache is used and displayed with its date, marked stale past a
threshold. A dated number is more useful than a blank; and the file stays
readable standing alone.

Links are one-directional: a child file never knows it is referenced.

---

## 9. Template-Instance for Schools (summary — full spec doc 15)

A unit marked `isTemplate` renders once on the canvas with its position
children. Those children's detail rows define *columns*; the figures live in
`Project.instances` — one row per school, keyed by detail-row id, so per-level
(jenjang) granularity survives.

Filling 300 schools × 15 positions happens in Excel via a matrix sheet, using
the existing export–edit–reimport cycle. The canvas shows 16 nodes; the recap
sums 300 instances.

This answers the requirement that drove it: figures at **position × school**
granularity, without 300 files or a 4,500-node canvas.

---

## 10. Dashboard (summary — full spec doc 14)

A read-only view over every stored project: a government summary line
(including "38 of 42 agencies present", from `daftar-opd.json`), a card grid —
one card per agency with totals, sparkline-free by design, freshness date, and
findings status — placeholder cards for expected-but-missing agencies with an
import button, and a sortable comparison table with a government-wide category
breakdown.

Rendered from the project index without opening bodies, so it is instant;
per-category detail loads progressively. Clicking a card opens that project.

No government-wide diagram exists, deliberately.

---

## 11. Canvas, Validation, Import/Export, Recap

As v3 §§9–14, with these deltas:

- **Canvas** adds the combined unit-head card (doc 05) and the link-node card.
- **Validation** adds `UNIT_TANPA_KEPALA`, `UNIT_BANYAK_KEPALA`, `LINK_STALE`,
  `LINK_UNRESOLVED`, and template-figure violations (docs 04, 13, 15).
- **Recap** uses the extended aggregate formula (doc 07 §2b) and marks rows
  whose figures include cached link data.
- **XLSX** gains the instance matrix sheet for template units (doc 15).
- **Project manager** gains search, kodeOPD grouping, origin marking, and bulk
  JSON import (doc 10, doc 14).

---

## 12. Technology

As v3 §17, with: **idb-keyval** (or equivalent thin wrapper) replacing raw
LocalStorage for project bodies and index. Everything else unchanged.

---

## 13. Non-Functional

- Smooth to **500 nodes per file**; the dashboard handles **60+ projects**
  rendering from the index alone
- Storage design target: **50 MB** total (IndexedDB), with the usage meter
  retained
- 50-step undo/redo; Indonesian UI; light theme; fully offline; Chrome/Edge
  current

---

## 14. Definition of Done

**Stage A:** the v3 §23 checklist, unchanged, plus:

- [ ] a unit with one structural head renders as a combined card; the toggle
      separates them; data remains two nodes
- [ ] `UNIT_TANPA_KEPALA` / `UNIT_BANYAK_KEPALA` fire correctly

**Stage B:** an Organization Bureau member, unsupervised, can:

- [ ] convert a unit node into a link to another stored project and see live
      totals; delete the target and see cached totals with a staleness date
- [ ] bulk-import 40 JSON files in one drag and find them grouped and
      searchable in the project manager
- [ ] open the dashboard and see one card per stored agency, placeholders for
      missing ones from `daftar-opd.json`, and a government total equal to the
      sum of the cards
- [ ] mark a unit as template, define its positions and levels once, export the
      instance matrix, fill 300 rows in Excel, re-import, and see canvas,
      recap, and dashboard all reflect the instance sums
- [ ] verify a template file exported and re-imported reproduces instances
      exactly

---

## 15. Risks

The v3 §24 table remains valid. Additions:

| Risk | Mitigation |
|---|---|
| Stale link caches read as current figures | Cache always displayed with its date; staleness threshold marks it visually; dashboard recomputes and never caches |
| Stage B built against imagined files | Hard gate: Stage A DoD passes first; Stage B developed against real Stage A outputs |
| Template columns drift from instance data after structure edits | Instances key on `rincianId`; deleting a detail row with instance data requires confirmation naming the affected school count (doc 15) |
| IndexedDB unavailable (private mode, policy) | Same detection-and-banner strategy as before; in-memory fallback with persistent warning |
| Delegated operators on stale builds | App version in status bar; `configVersion` banner on import; newer-schema files refuse to load with a reload instruction |
