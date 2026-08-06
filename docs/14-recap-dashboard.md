# 14 — Recap Dashboard & Bulk Import

> **See also**: [doc 20](./20-skalabilitas-worker-virtualisasi.md) — the
> dashboard's per-category breakdown now runs off the main thread via
> `src/workers/` (Fase 2.3, done), and Fase 3.1 (planned, not yet built) will
> change `computeGlobalBreakdown` to fold over small precomputed
> `ProjectSummary` records instead of reading every project body, making it
> O(number of OPDs) instead of O(total nodes government-wide).

## Purpose

One read-only view over every stored project: the government-wide totals, per-OPD
cards, gaps made visible, and the bulk-import path that feeds it. It answers the
Organization Bureau's standing question — *where does the whole government stand,
and which files are missing or stale* — without a backend and without a
mega-canvas.

---

## 1. Expected-agency list

`src/config/daftar-opd.json`, bundled like the taxonomy:

```json
{
  "listVersion": "2026.1",
  "opd": [
    { "kode": "SETDA",  "nama": "Sekretariat Daerah",   "kelompok": "Sekretariat" },
    { "kode": "DINKES", "nama": "Dinas Kesehatan",      "kelompok": "Dinas" },
    { "kode": "DISDIK", "nama": "Dinas Pendidikan",     "kelompok": "Dinas" },
    { "kode": "KEC-01", "nama": "Kecamatan Kota Timur", "kelompok": "Kecamatan" }
  ]
}
```

This list is what makes absence visible: a dashboard that only shows what exists
cannot answer "who hasn't submitted". `kelompok` drives grouping in both the
dashboard and the project manager.

Matching is by `kodeOPD`. A stored project whose code isn't in the list still
gets a card, under a "Lainnya" group with an info marker — the list constrains
nothing, it only names expectations.

### 1.1 `daftar-opd.json` Lifecycle & Custom OPD Extensions

1. **Static Bundle & Versioning**: Distributed as part of app build bundle (`src/config/daftar-opd.json`). Includes `listVersion` timestamp/semantic tag.
2. **Runtime Extension**: Operators can add custom OPD entries via **Pengaturan Dashboard > Tambah OPD Khusus**. Custom OPD entries are stored in `pjb:v1:ui` under `customOpdList` and merged with static `daftar-opd.json` at runtime.
3. **Orphan / Unknown Code Resolution**:
   - If an imported file has `kodeOPD` not in `daftar-opd.json` nor `customOpdList`, it is rendered under the **"Lainnya / Non-Terdaftar"** group.
   - The UI offers a quick action on the card: **"Daftarkan sebagai OPD Resmi"**, which adds it to `customOpdList`.
4. **Code Alias / Deprecation**: If an OPD changes code (e.g. `DISKOMINFO` → `DISKOMINFOTIK`), `daftar-opd.json` can specify an `"alias": ["DISKOMINFO"]` field to map historical codes cleanly without breaking dashboard matching.

---

## 2. Data source: the index, not the bodies

The dashboard renders entirely from `ProjectIndexEntry` (doc 10 §1, extended):

```ts
interface ProjectIndexEntry {
  id: string;
  namaOPD: string;
  kodeOPD: string;
  nodeCount: number;
  totalKebutuhan: number;
  totalEksisting: number;        // added
  findingCounts: { errors: number; warnings: number };   // added
  linkedCodes: string[];         // added — for cycle guard, doc 13 §2
  origin: 'created' | 'imported';                        // added
  updatedAt: string;
  lastExportedAt: string | null;
}
```

The index is updated on every save (doc 10 §2), so these fields are always
current for local edits and as-of-import for received files. Opening the
dashboard deserializes **zero** project bodies — with 60 projects that is the
difference between instant and a multi-second stall.

The one thing the index cannot answer is the per-category breakdown (§5). That
requires bodies, and loads progressively after the cards render.

### Double-count guard

A Puskesmas project is counted once in the government total — via its own card
— and its figures also live inside Dinas Kesehatan's card through link nodes.
Summing all cards would double-count every linked file.

Rule: **the government total sums only top-level projects** — those whose
`kodeOPD` is not referenced by any other stored project's `linkedCodes`. Linked
projects render as sub-cards nested under their parent's card, visually inside
it, and excluded from the headline sum. This mirrors the structural reality:
the Puskesmas is part of Dinkes, and the dashboard says so.

A project referenced by two parents (mis-linked) is flagged
`DASH_DOUBLE_LINKED` and counted once under the first, so the total stays
consistent while the problem is visible.

---

## 3. Layout

```
┌─ PEMERINTAH KOTA X ─────────────────────────────────────────┐
│ Keb 14.892 · Eks 12.907 · −1.985      38 dari 42 OPD masuk  │
│ 3 file basi (>30 hari) · 2 file bermasalah                  │
├─ DINAS ─────────────────────────────────────────────────────┤
│ ┌────────────┐ ┌────────────┐ ┌ ─ ─ ─ ─ ─ ─┐               │
│ │ DINKES     │ │ DISDIK     │ │ DISHUB      │  ← placeholder│
│ │ 412/358    │ │ 2847/2401  │ │ belum masuk │               │
│ │ −54  ⚠3    │ │ −446  ✓    │ │ [Impor]     │               │
│ │ 2 Agu      │ │ kemarin    │ └ ─ ─ ─ ─ ─ ─┘               │
│ │ ┌────────┐ │ └────────────┘                               │
│ │ │28 PKM  │ │   ← nested linked-file summary               │
│ │ └────────┘ │                                              │
│ └────────────┘                                              │
├─ KECAMATAN ───────────────── (grouped per daftar-opd) ──────┤
│ …                                                           │
├─ TABEL PERBANDINGAN ────────────────────────────────────────┤
│ sortable: nama · keb · eks · selisih · %terisi · diubah     │
├─ PER KATEGORI (SE-PEMDA) ──────────── loads progressively ──┤
│ Struktural … · Fungsional … · Pelaksana …                   │
└─────────────────────────────────────────────────────────────┘
```

Card contents, in priority order: code + name, the three figures, findings
badge, freshness date, nested linked-file count. Click opens the project.
Placeholder cards carry the import button — the dashboard is a work queue for
collection, not just a report.

Staleness on the dashboard means `updatedAt` older than 30 days for
`origin: 'imported'` files — the Bureau's copy may lag the operator's reality,
and the date is the only honest signal available without a backend.

**Read-only, recomputed on open.** Nothing here is stored, so nothing here can
be stale beyond what the underlying files are. This is the property that made
the dashboard preferable to a "Pemkot file" of link nodes, and it must be
preserved: no caching layer on top.

---

## 4. Bulk import

The dashboard's feeder. Available from the project manager and from any
placeholder card.

```
drop 40 .json files
 └─▶ per file: parse → migrate → zProject.safeParse → classify
      └─▶ staging list: one row per file, status each
           └─▶ [Impor N file]  — single confirmation, then sequential commit
```

Staging statuses per file:

| Status | Meaning | Default action |
|---|---|---|
| `new` | `kodeOPD` not in storage | import |
| `replace` | Same `kodeOPD` exists, incoming `updatedAt` newer | replace, old body kept under a `pjb:v1:archive:` key for one generation |
| `older` | Same `kodeOPD`, incoming is older | skip, overridable per row |
| `invalid` | Fatal parse/schema failure | skip, error shown, raw downloadable |
| `duplicate-in-batch` | Two files in the drop share a `kodeOPD` | newest wins, other skipped, flagged |

Replace-vs-duplicate is decided by `kodeOPD`, consistent with link resolution.
The one-generation archive on replace is the safety net for the most likely
bulk mistake — importing an old batch over newer local edits — and costs one
key per project.

Imported projects get `origin: 'imported'`; the project manager and dashboard
use it to distinguish the Bureau's own files from received ones.

Bulk import never opens any project; it writes bodies and index entries only.
After commit, the dashboard reflects the batch immediately.

### 4.1 Bulk Import Atomicity & Error Recovery

During bulk import of 40+ files, partial failures (e.g., mid-batch QuotaExceededError or corrupted individual files) must not corrupt the global state or project index.

1. **Two-Phase Commit**:
   - **Phase 1 (Staging & Body Writes)**: Write all valid project bodies to IndexedDB (`pjb:v1:project:<uuid>`). Keep track of successfully written keys in an execution log.
   - **Phase 2 (Atomic Index Commit)**: Update the central index `pjb:v1:index` in a single atomic storage transaction after all project bodies are flushed.
2. **Partial Failure Rollback**:
   - If an unrecoverable storage error occurs during Phase 1, prompt operator with option: **"Batalkan Semua (Rollback)"** or **"Simpan yang Berhasil (`N` file)"**.
   - Choosing rollback deletes the newly written keys listed in the execution log before updating the index.
3. **Archive Preservation**: Replaced projects (`pjb:v1:archive:<uuid>`) are committed only after the new version is verified stored.

---

## 5. Government-wide category breakdown

The only dashboard section needing bodies. Loads after first paint:

```ts
async function computeGlobalBreakdown(topLevel: ProjectIndexEntry[]): Promise<RecapBucket[]> {
  const acc = seedFromTaxonomy();
  for (const entry of topLevel) {
    const project = await storage.readProject(entry.id);        // sequential, yielding
    foldCategoryTotals(acc, project);                           // reuses doc 07 logic
    yieldToUi();
  }
  return finalize(acc);
}
```

Sequential with UI yields, a progress indicator, and abort-on-navigate. Linked
projects' figures enter through their parents' link caches — consistent with
the card sums, so the breakdown total reconciles with the headline.

Template-instance figures (doc 15) are already inside each project's own totals
and category folds; nothing special here.

### Consolidated XLSX export

One button: a workbook with a government recap sheet plus one sheet per
top-level project, using the doc 09 writers per sheet, with link-prefixed
numbering (doc 13 §6). Linked files appear as sheets under their parent's
grouping. This is the "complete document" deliverable — many parts, one file,
never one canvas.

---

## 6. Edge cases

**Empty storage.** The dashboard still renders: the full placeholder grid from
`daftar-opd.json`, zero totals, and copy pointing at bulk import. This is the
Bureau's day-one screen and it should read as a to-do list, not an error.

**Sixty projects, low-end machine.** Cards from the index: instant regardless.
The breakdown may take seconds — hence progressive, hence abortable.

**`daftar-opd.json` outdated** (an agency merged or split). Extra stored
projects land in "Lainnya"; obsolete placeholders show as never-submitted. Both
are visible and neither breaks anything; `listVersion` is displayed so the
mismatch is diagnosable. The list ships with the app build, same as the
taxonomy.

**A stored project with empty `kodeOPD`.** Cannot be matched, grouped, or
linked. It appears under "Lainnya" flagged `META_OPD_MISSING`, and the card's
click-through goes straight to the metadata panel.

**Clock skew on imported files.** `updatedAt` written by the operator's
machine. Staleness display says "per <date>" rather than "N days old", so a
wrong clock produces an odd date rather than a wrong claim.

---

## 7. Exit criteria

- [ ] Dashboard first paint deserializes zero project bodies (instrumented)
- [ ] Government total counts each linked project exactly once; verified on a
      fixture with Dinkes + 3 Puskesmas
- [ ] Nested sub-cards render for linked files; headline excludes them
- [ ] Placeholder cards appear for every expected-but-absent agency
- [ ] Unknown-code projects group under "Lainnya", nothing lost
- [ ] Bulk drop of 40 fixtures stages correctly across all five statuses
- [ ] Replace archives the previous body for one generation
- [ ] Duplicate codes within a batch: newest wins, flagged
- [ ] Category breakdown reconciles with the headline total on the linked fixture
- [ ] Breakdown loads progressively and aborts cleanly on navigation
- [ ] Consolidated XLSX: one sheet per top-level project, link-prefixed numbering
- [ ] Empty storage renders the placeholder grid with import affordances
