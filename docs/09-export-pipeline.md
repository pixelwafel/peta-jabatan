# 09 — Export Pipeline

## Purpose

Produce four artifacts from one dataset, with the spreadsheet column spec shared
with the import template so the export → bulk-edit → re-import cycle actually
closes.

---

## 1. The shared column spec

One constant, consumed by the template generator, the XLSX writer, the CSV writer,
and the import column mapper. Duplicating it anywhere breaks the round trip.

```ts
interface ColumnDef {
  key: string;
  header: string;
  width: number;
  importable: boolean;             // false = informational only on re-import
  get: (ctx: RowContext) => string | number | null;
}

interface RowContext {
  node: OrgNode;
  rincian: Rincian | null;         // null for unit rows
  parent: OrgNode | null;
  totals: NodeTotals;              // subtree totals for units, own for positions
  cfg: Taxonomy;
}

const COLUMNS: ColumnDef[] = [
  { key: 'nomor',      header: 'nomor',      width: 10, importable: true,
    get: c => c.node.nomor },
  { key: 'nama',       header: 'nama',       width: 34, importable: true,
    get: c => c.node.nama },
  { key: 'tipe',       header: 'tipe',       width: 10, importable: true,
    get: c => c.cfg.labels[c.node.type] },
  { key: 'kategori',   header: 'kategori',   width: 14, importable: true,
    get: c => getKategori(c.node.kategoriId)?.nama ?? '' },
  { key: 'rumpun',     header: 'rumpun',     width: 14, importable: true,
    get: c => c.node.rumpun.map(rumpunLabel).join(', ') },
  { key: 'jenjang',    header: 'jenjang',    width: 16, importable: true,
    get: c => c.rincian?.jenjangId ? jenjangLabel(c.rincian.jenjangId) : '' },
  { key: 'kebutuhan',  header: 'kebutuhan',  width: 11, importable: true,
    get: c => c.rincian ? c.rincian.kebutuhan : c.totals.kebutuhan },
  { key: 'eksisting',  header: 'eksisting',  width: 11, importable: true,
    get: c => c.rincian ? c.rincian.eksisting : c.totals.eksisting },
  { key: 'selisih',    header: 'selisih',    width: 9,  importable: false,
    get: c => c.rincian ? c.rincian.eksisting - c.rincian.kebutuhan : c.totals.selisih },
  { key: 'kode',       header: 'kode',       width: 14, importable: true,
    get: c => c.node.kode ?? '' },
  { key: 'unit_kerja', header: 'unit_kerja', width: 20, importable: true,
    get: c => c.node.unitKerja ?? '' },
  { key: 'keterangan', header: 'keterangan', width: 28, importable: true,
    get: c => c.node.keterangan ?? '' },
  { key: 'parent_nomor', header: 'parent_nomor', width: 12, importable: false,
    get: c => c.parent?.nomor ?? '' },
  { key: 'parent_nama',  header: 'parent_nama',  width: 30, importable: false,
    get: c => c.parent?.nama ?? '' },
  { key: 'parent_id',    header: 'parent_id',    width: 36, importable: false,
    get: c => c.parent?.id ?? '' },
];
```

Custom attributes append after these, one column each, headed by `attr.nama`.

### Why three parent columns, none of them importable

`parent_nomor` and `parent_nama` are for reading — a human scanning the sheet needs
to see where a position sits without mentally parsing numbers. `parent_id` is for
external tooling that wants a real key.

**All three are ignored on import.** Hierarchy comes from `nomor`, always
(doc 08 §5). This is deliberate redundancy: the informational columns can be edited
or deleted by an operator without any risk of corrupting structure. If `parent_id`
were authoritative, deleting a column an operator found confusing would silently
destroy the tree.

`selisih` is likewise export-only. It is derived (invariant 6), and accepting it on
import would create a path for stored derived data to re-enter the model.

### Unit rows carry aggregates

A unit row shows `subtreeTotals` in the figure columns. This makes the spreadsheet
readable as a report — a division row shows its division total.

It also means **the figure columns are not summable down the sheet**: unit rows
double-count their descendants. The XLSX writer must make this visually obvious
(§3), and re-import discards unit figures anyway (doc 08 §5), so the round trip
stays correct even though the flat sum does not.

---

## 2. Row generation

One row per detail row; one row per unit.

```ts
function buildRows(project: Project, recap: Recap, cfg: Taxonomy): RowContext[] {
  const idx = buildIndex(project.nodes, project.edges);
  const ordered = [...project.nodes].sort(byNomorThenTree);

  return ordered.flatMap(node => {
    const parent = idx.parentId.get(node.id)
      ? idx.nodeById.get(idx.parentId.get(node.id)!)! : null;

    if (node.type === 'unit')
      return [{ node, rincian: null, parent, totals: recap.subtreeTotals.get(node.id)!, cfg }];

    if (node.rincian.length === 0)
      // Emit an empty row rather than dropping the node — a position missing from
      // the export would be silently lost on re-import.
      return [{ node, rincian: null, parent, totals: ZERO, cfg }];

    return sortRincian(node).map(r =>
      ({ node, rincian: r, parent, totals: recap.nodeTotals.get(node.id)!, cfg }));
  });
}
```

Row order is `nomor` where present, tree order otherwise:

```ts
const byNomorThenTree = (a: OrgNode, b: OrgNode) => {
  if (a.nomor && b.nomor) return compareNomor(a.nomor, b.nomor);
  if (a.nomor) return -1;
  if (b.nomor) return 1;
  return treeOrderIndex(a.id) - treeOrderIndex(b.id);
};
```

Nodes without a `nomor` sort last. Combined with the readiness check flagging blank
numbers, this makes the omission visible rather than scattering unnumbered rows
through the sheet.

**Recommend Renumber before export.** If any node lacks a `nomor`, the export dialog
offers to run `renumberFromStructure()` first — without numbers, the re-import round
trip cannot reconstruct hierarchy.

---

## 3. XLSX writer

> [!IMPORTANT]
> **SheetJS CE Capability Note (FIX-04)**
>
> The `xlsx` npm package (v0.18.x, Apache-2.0) is **SheetJS Community Edition**.
> Two features in the original specification — `applyDataValidation` and `shadeUnitRows` —
> are **not supported by CE** and require an upgrade path:
>
> | Feature | CE Support | Alternative |
> |---|---|---|
> | `forceTextFormat` (cell `t:'s'`, `z:'@'`) | ✅ Supported | — |
> | Column widths (`ws['!cols']`) | ✅ Supported | — |
> | Freeze panes (`ws['!freeze']`) | ✅ Supported | — |
> | Cell styling / background fill (`cell.s`) | ❌ Not supported | Use `xlsx-js-style` fork |
> | Data validation dropdowns (`ws['!dataValidation']`) | ❌ Not supported | Template approach (see below) |
>
> **Recommended approach for this project:**
> - **Styling** (`shadeUnitRows`): Replace `xlsx` with the community fork
>   [`xlsx-js-style`](https://github.com/gitbrent/xlsx-js-style) — drop-in compatible,
>   MIT-licensed, restores `cell.s` property. Impact: change import, add `cell.s` calls.
> - **Data validation** (`applyDataValidation`): Use a **pre-built OOXML template**.
>   Embed a minimal `.xlsx` file (with validation rules already authored) as a base64
>   string, load it via `XLSX.read()`, then write data rows into it. This is a common
>   pattern for CE users and avoids a library change.
>
> The current implementation (see `src/export/xlsxExporter.ts`) omits both features
> and ships without them. This is a known gap, not a bug — `forceTextFormat` is
> implemented and is the highest-priority line.

```ts
function exportXlsx(project: Project, recap: Recap): Blob {
  const wb = XLSX.utils.book_new();
  const cols = [...COLUMNS, ...customColumns(project.attributeSchema)];
  const rows = buildRows(project, recap, taxonomy);

  // Sheet: Struktur
  const aoa = [cols.map(c => c.header), ...rows.map(r => cols.map(c => c.get(r)))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = cols.map(c => ({ wch: c.width }));
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };

  // CRITICAL: keeps 1.10 as text so it never collapses to 1.1 in Excel.
  forceTextFormat(ws, colIndex(cols, 'nomor'));
  forceTextFormat(ws, colIndex(cols, 'kode'));

  // applyDataValidation(ws, cols, taxonomy);
  // → Not available in SheetJS CE. Options: xlsx-js-style fork or template approach.
  // Current status: omitted. Impact: exported XLSX cannot be used as an editing
  // template with enforced dropdowns. Operators editing manually must use the
  // separately downloaded template file instead of the export.

  // shadeUnitRows(ws, rows, cols);
  // → Cell styling requires xlsx-js-style. Current status: omitted.
  // Impact: unit rows (aggregates) are visually indistinguishable from position rows.
  // The column header 'tipe' still lets operators distinguish them programmatically.

  XLSX.utils.book_append_sheet(wb, ws, 'Struktur');
  XLSX.utils.book_append_sheet(wb, buildReferensiSheet(taxonomy), 'Referensi');
  XLSX.utils.book_append_sheet(wb, buildRekapSheet(recap), 'Rekap');
  XLSX.utils.book_append_sheet(wb, buildMetaSheet(project), 'Info');

  return new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })],
                  { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
```

`forceTextFormat` on `nomor` is the highest-value line in this file. Without it,
Excel converts `1.10` to the number `1.1` on open, and a re-import silently merges
two nodes. The formatting must survive the round trip, so the writer sets both the
cell type (`t: 's'`) and the column format (`z: '@'`).

`applyDataValidation` would mean an exported file is *also* a valid editing template
with enforced dropdowns. Without it, operators editing in Excel must use the separately
downloaded template (from the Import dialog) to get validated dropdowns. The
round-trip data cycle still works — the validation gap only affects the editing UX,
not the structural correctness of re-imported files.

The `Rekap` sheet mirrors the recap panel — totals, per unit, per category, per
level. It is the sheet most likely to be pasted into a report, so it is formatted
for reading rather than for parsing.

The `Info` sheet carries agency name and code, author, budget year,
`schemaVersion`, `configVersion`, app version, and export timestamp. This is how a
file arriving three months later can be diagnosed at all.

---

## 4. CSV writer

Same rows, same columns, no formatting, no extra sheets.

```ts
function exportCsv(project: Project, recap: Recap): Blob {
  const cols = [...COLUMNS, ...customColumns(project.attributeSchema)];
  const rows = buildRows(project, recap, taxonomy);
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.map(c => esc(c.header)).join(','),
                 ...rows.map(r => cols.map(c => esc(c.get(r))).join(','))];
  return new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
}
```

The BOM is required — without it Excel misreads UTF-8 and every Indonesian name
with a non-ASCII character displays as mojibake. CRLF for the same reason.

Comma delimiter with a BOM works in Excel for most Indonesian locale
configurations; semicolon is the safer choice where the list separator is `;`.
Offer both in the export dialog rather than guessing, defaulting to comma.

---

## 5. PNG export

```ts
async function exportPng(opts: { background: 'white' | 'transparent'; scale: number }): Promise<Blob> {
  const nodes = getRfNodes();
  const bounds = getNodesBounds(nodes);
  const PAD = 40;
  const width  = Math.ceil(bounds.width  + PAD * 2);
  const height = Math.ceil(bounds.height + PAD * 2);

  const viewport = document.querySelector('.react-flow__viewport') as HTMLElement;

  return toBlob(viewport, {
    backgroundColor: opts.background === 'white' ? '#ffffff' : undefined,
    width: width * opts.scale,
    height: height * opts.scale,
    pixelRatio: 1,
    style: {
      width: `${width}px`,
      height: `${height}px`,
      // Neutralize the current pan/zoom so the capture is the whole diagram,
      // not what happens to be on screen.
      transform: `translate(${-bounds.x + PAD}px, ${-bounds.y + PAD}px) scale(${opts.scale})`,
      transformOrigin: 'top left',
    },
    filter: n => !(n as HTMLElement)?.classList?.contains?.('react-flow__minimap')
              && !(n as HTMLElement)?.classList?.contains?.('react-flow__controls'),
  });
}
```

Points that cause visible bugs if missed:

- **Temporarily expand all collapsed nodes** and restore afterward, or the PNG
  omits parts of the structure the operator believes they exported. Do it via a
  `transient` commit so it leaves no history entry.
- **Wait for fonts**: `await document.fonts.ready` before capture, or text renders
  in a fallback face.
- **Cap total pixels.** A 500-node chart at scale 2 can exceed browser canvas
  limits and fail with an opaque error. Compute `width * height * scale²`, and if it
  exceeds ~40 megapixels, reduce scale automatically and tell the operator.
- **Filter out minimap and controls**, which are inside the React Flow container.

### 5.1 PNG Capture Failure & Fallback Strategy

When exporting large charts (300+ nodes), HTML Canvas rendering via `html-to-image` may fail due to browser memory limits, CORS font restrictions, or canvas dimension caps. The fallback flow is:

1. **Automatic Scale Reduction**: If capture throws a memory/canvas size exception, automatically retry at `scale = 1` and display an info toast ("Skala PNG diturunkan ke 1x untuk menyesuaikan memori browser").
2. **SVG Vector Download**: If canvas capture fails entirely (e.g. `toBlob` returns null), fall back to exporting raw SVG (`exportSvg()`), preserving crisp vector rendering without canvas buffer limitations.
3. **Browser Print Fallback**: As a last resort, offer **Print/Save to PDF via Browser** (`window.print()`) using a print-optimized CSS stylesheet `@media print`.

Scale options: 1× (screen), 2× (recommended, for slides), 3× (print). Default 2×.

**PDF is V1**, and it is not simply "PNG in a page". A useful PDF needs paper size
(including F4/Folio, still standard in many Indonesian offices), orientation,
multi-page tiling, and a header block. That is a feature, not a wrapper — which is
why the brief defers it and PNG covers the immediate need.

---

## 6. Filenames

```ts
function exportFilename(project: Project, ext: string): string {
  const kode = slug(project.meta.kodeOPD) || 'opd';
  const nama = slug(project.meta.namaOPD).slice(0, 40);
  const date = new Date().toISOString().slice(0, 10);
  return `peta-jabatan_${kode}${nama ? '_' + nama : ''}_${date}.${ext}`;
}
```

`peta-jabatan_dinkes_dinas-kesehatan_2026-08-03.xlsx`. The date is what makes
successive revisions distinguishable in a shared folder — the single most common
consolidation problem.

If `kodeOPD` is empty, the export dialog asks for it rather than silently producing
`peta-jabatan_opd_*.xlsx`. This is the one place metadata is effectively required,
and it is the right place: the file is about to leave the operator's machine.

---

## 7. Export dialog

```
┌─ EKSPOR ──────────────────────────────────┐
│ ⚠ 8 jabatan belum ditempatkan             │   readiness summary, if any
│   [Lihat detail]                          │
│                                           │
│ ☑ JSON      untuk disimpan & dibuka lagi  │
│ ☑ Excel     untuk data & penyuntingan     │
│ ☐ CSV       untuk analisis                │
│ ☑ PNG       untuk paparan                 │
│                                           │
│ Skala PNG   [2× ▾]   Latar [Putih ▾]      │
│ Pemisah CSV [Koma ▾]                      │
│                                           │
│ ⓘ 12 node belum bernomor.                 │
│   [Beri nomor otomatis]                   │
│                                           │
│         [Batal]      [Ekspor 3 berkas]    │
└───────────────────────────────────────────┘
```

JSON, XLSX, and PNG default on because that is the normal handover set. Multi-select
export means one action produces everything needed, rather than three trips through
a menu.

The readiness summary appears inline. It does not block (doc 04 §4) but it is the
last honest moment to mention that eight positions are unplaced.

The renumber prompt appears only when needed, and explains why it matters: without
numbers, the file cannot be re-imported into the same structure.

---

## 8. Edge cases

**Empty project.** Export disabled with an explanation, not a zero-row file.

**Position with no detail rows.** Emits one row with blank figures. Dropping it
would lose the node on re-import — the row's existence is what preserves it.

**Node with no `nomor`.** Exports blank. The re-import will skip that row with
`IMPORT_NO_NOMOR`, which is why the dialog offers renumbering.

**Duplicate `nomor` values.** Exported as-is. Re-import merges them into one node —
lossy. The readiness check warns before export (`NODE_NOMOR_DUPLICATE`), so the
operator has been told.

**Custom attribute named like a reserved column** (an attribute called "kategori").
`customColumns` suffixes it (`kategori_2`) and warns. Without this, the import
mapper would bind the custom column to the reserved field.

**Very long names in XLSX.** Truncate at 255 characters (Excel's cell limit) and
warn.

**Browser blocks multiple downloads.** Sequence them 300 ms apart, or bundle into a
ZIP when more than two files are selected.

**Unsaved figure edits at export time.** Flush any pending coalescing transaction
before building rows, or the last typed digit is missing from the file.

---

## 9. Exit criteria

- [ ] `COLUMNS` is the single source for template, XLSX, CSV, and import mapping
- [ ] Export → re-import produces an equivalent structure (nodes, edges, figures,
      categories, levels) on a 100-node fixture
- [ ] `nomor` column survives an Excel open/save round trip with `1.10` intact
- [ ] `parent_id`, `parent_nomor`, `parent_nama`, `selisih` ignored on import
- [ ] Unit rows carry subtree aggregates and are visually shaded
- [ ] Positions with zero detail rows still emit a row
- [ ] Exported XLSX carries working dropdowns
- [ ] CSV opens correctly in Excel with Indonesian characters intact
- [ ] PNG captures the whole diagram regardless of current pan/zoom
- [ ] Collapsed nodes expanded for PNG, restored after, no history entry
- [ ] PNG waits for `document.fonts.ready`
- [ ] Oversized PNG reduces scale automatically with a message
- [ ] Minimap and controls excluded from PNG
- [ ] Filename includes agency code and date
- [ ] Export dialog surfaces readiness findings and offers renumbering when needed
- [ ] Pending edits flushed before export
