# 06 — Property Panel & Detail Rows

## Purpose

Edit one node's attributes and figures. Contains the chip picker that resolves the
functional-level question: show every valid level, create rows only for the ones
selected.

---

## 1. Panel structure

```
┌─ PROPERTI ─────────────────────┐
│ Tipe      [Unit ▾]             │
│ Nama      [_________________]  │
│ Nomor     [1.2.1]  [↻]         │   ↻ = renumber from structure
│ Kode      [_________________]  │
│ Atasan    [Bidang Pendidikan ▾]│
├─ KLASIFIKASI ──────────────────┤   hidden when type === 'unit'
│ Kategori  [Fungsional ▾]       │
│ Rumpun    [✓Keahlian][ Keteram]│   only when kategori.punyaRumpun
├─ ANGKA ────────────────────────┤
│ Jenjang yang ada:              │
│ [✓Ahli Utama][✓Ahli Madya]     │   ← chip picker
│ [ Ahli Muda ][ Ahli Pertama]   │
│                                │
│ Jenjang        Keb   Eks   Sel │
│ Ahli Utama    [ 1] [ 1]    0   │
│ Ahli Madya    [ 3] [ 2]   −1   │
│ ────────────────────────────── │
│ Total           4     3   −1   │
├─ TAMBAHAN ─────────────────────┤
│ Unit Kerja[_________________]  │
│ Keterangan[_________________]  │
├─ ATRIBUT KHUSUS ───────────────┤
│ Formasi 2027   [__]            │
│ Lokasi Kerja   [_____________] │
└────────────────────────────────┘
```

Section order follows the order an operator fills things in: identity, then
placement, then classification (which gates the levels), then figures, then
optional detail. The figures section is the one they return to most, so it sits
above the rarely-touched extras rather than at the bottom.

### Empty and multi-selection states

| Selection | Panel shows |
|---|---|
| Nothing | Project metadata: agency name, code, author, budget year |
| One node | Full panel as above |
| Multiple | Bulk actions only: set category, set parent, delete, tidy subtree |

Using the empty state for project metadata rather than a separate dialog means
`namaOPD` and `kodeOPD` are visible on first open, which is when they should be
filled. A metadata dialog buried in a menu is a metadata dialog nobody opens —
and `META_OPD_MISSING` then fires on every project.

Bulk editing figures is deliberately absent. Setting twelve positions to the same
requirement count is more plausibly a mistake than an intention, and the
export–edit–import cycle (doc 09) is the honest path for bulk figure work.

---

## 2. The chip picker

This is the mechanism that replaces both "one node per level" and "pre-create all
four rows and delete the unneeded".

```tsx
function JenjangChips({ node }: { node: OrgNode }) {
  const options = getJenjangOptions(node.kategoriId, node.rumpun);
  if (options.length === 0) return null;            // pelaksana, or no rumpun chosen

  const active = new Set(node.rincian.map(r => r.jenjangId).filter(Boolean));

  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(j => (
        <Chip
          key={j.id}
          label={j.nama}
          active={active.has(j.id)}
          onClick={() => toggleJenjang(node.id, j.id)}
        />
      ))}
    </div>
  );
}
```

Every valid level is visible at all times. The operator does not need to remember
the ladder, and nothing exists in the data that they didn't choose.

```ts
function toggleJenjang(nodeId: string, jenjangId: string) {
  const node = nodeById(nodeId);
  const existing = node.rincian.find(r => r.jenjangId === jenjangId);

  if (!existing) {
    addRincian(nodeId, jenjangId);                   // inserted in config order, §3
    return;
  }

  if (existing.kebutuhan === 0 && existing.eksisting === 0) {
    removeRincian(nodeId, existing.id);              // nothing to lose, no prompt
    return;
  }

  confirm({
    title: `Hapus jenjang ${jenjangLabel(jenjangId)}?`,
    body: `Baris ini berisi kebutuhan ${existing.kebutuhan} dan eksisting ${existing.eksisting}. Angka tersebut akan hilang.`,
    confirmLabel: 'Hapus',
    onConfirm: () => removeRincian(nodeId, existing.id),
  });
}
```

Two details matter more than they look.

**Deactivating an empty row doesn't prompt.** The most common correction is a
misclick, and a confirmation on a zero-value row is friction with nothing behind
it. The prompt appears exactly when data would be lost.

**The confirmation names the figures.** *"berisi kebutuhan 3 dan eksisting 2"* is
information; *"data akan hilang"* is a dialog people learn to dismiss without
reading.

### Non-functional positions

When `options.length === 0`, the picker hides and the node keeps a single row with
`jenjangId: null`, rendered as one unlabeled pair of inputs. Structural positions
with levels (JPT Pratama, Administrator, Pengawas) *do* get chips — but a
structural position has exactly one level in practice, so the picker acts as a
single-select in effect. No special-casing needed: the same code produces both
behaviors.

---

## 3. Detail row table

```tsx
function RincianEditor({ node }: { node: OrgNode }) {
  const rows = sortRincian(node);
  const totals = nodeTotals(node.id);
  const labeled = getJenjangOptions(node.kategoriId, node.rumpun).length > 0;

  return (
    <table>
      {rows.map(r => (
        <tr key={r.id}>
          <td>{labeled ? jenjangLabel(r.jenjangId) : '—'}</td>
          <td><NumberInput value={r.kebutuhan}
                onChange={v => updateRincian(node.id, r.id, { kebutuhan: v }, `num:${r.id}:keb`)} /></td>
          <td><NumberInput value={r.eksisting}
                onChange={v => updateRincian(node.id, r.id, { eksisting: v }, `num:${r.id}:eks`)} /></td>
          <td className={selisihClass(r)}>{r.eksisting - r.kebutuhan}</td>
        </tr>
      ))}
      <tfoot>
        <tr><td>Total</td><td>{totals.kebutuhan}</td><td>{totals.eksisting}</td>
            <td className={selisihClass(totals)}>{totals.selisih}</td></tr>
      </tfoot>
    </table>
  );
}
```

Row order follows config order, not insertion order:

```ts
function sortRincian(node: OrgNode): Rincian[] {
  const order = new Map(getJenjangOptions(node.kategoriId, node.rumpun).map((j, i) => [j.id, i]));
  return [...node.rincian].sort((a, b) =>
    (order.get(a.jenjangId ?? '') ?? 99) - (order.get(b.jenjangId ?? '') ?? 99));
}
```

So activating Ahli Pertama then Ahli Utama still lists Utama first. The table
matches the chip order and both match the regulatory ladder.

`selisih` is computed inline in the render — the one place where invariant 6 is most
tempting to violate for convenience.

### NumberInput contract

```ts
interface NumberInputProps {
  value: number;
  onChange: (v: number) => void;
  min?: number;                                      // default 0
}
```

- Non-numeric input rejected on keypress, not corrected on blur
- Empty field reads as 0 but displays empty while focused, so clearing to retype
  doesn't fight the operator
- Up/down arrows and scroll wheel increment; wheel only while focused, or scrolling
  the panel changes numbers
- `onChange` carries a txId so a stepper held down is one history entry
- Negative rejected at input, not caught by validation — `RINCIAN_NEGATIVE` exists
  for imported files, not for typing

---

## 4. Classification controls

### Category

```tsx
<Select
  value={node.kategoriId ?? ''}
  options={getKategoriList().map(k => ({ value: k.id, label: k.nama }))}
  onChange={id => handleKategoriChange(node, id)}
/>
```

```ts
function handleKategoriChange(node: OrgNode, next: string) {
  const invalidated = node.rincian.filter(r =>
    r.jenjangId && !isJenjangValid(next, node.rumpun, r.jenjangId));

  if (invalidated.length === 0) { setKategori(node.id, next); return; }

  confirm({
    title: 'Ubah kategori jabatan?',
    body: `${invalidated.length} baris jenjang tidak berlaku pada kategori ${getKategori(next)!.nama}. `
        + `Angkanya dipertahankan, tetapi jenjangnya dikosongkan dan perlu dipilih ulang.`,
    onConfirm: () => setKategori(node.id, next),
  });
}
```

Per doc 02 §5: figures survive, levels are nulled. The dialog says exactly that, so
the operator isn't guessing whether their numbers are about to disappear.

### Rumpun

```tsx
<ChipGroup
  options={[{ id: 'keahlian', label: 'Keahlian' }, { id: 'keterampilan', label: 'Keterampilan' }]}
  active={node.rumpun}
  onToggle={r => handleRumpunToggle(node, r)}
/>
```

Visible only when `getKategori(node.kategoriId)?.punyaRumpun`. Multi-select,
because the brief's "dan/atau" is real.

Deselecting a track cascades: rows whose level belongs to it become invalid.
`setRumpun` removes them, and the confirmation names the affected figures — the same
pattern as the chip picker, for the same reason.

```ts
function handleRumpunToggle(node: OrgNode, r: Rumpun) {
  const next = node.rumpun.includes(r) ? node.rumpun.filter(x => x !== r) : [...node.rumpun, r];
  const stillValid = new Set(getJenjangOptions(node.kategoriId, next).map(j => j.id));
  const doomed = node.rincian.filter(x => x.jenjangId && !stillValid.has(x.jenjangId));
  const withData = doomed.filter(x => x.kebutuhan > 0 || x.eksisting > 0);

  if (withData.length === 0) { setRumpun(node.id, next); return; }

  const keb = sum(withData, x => x.kebutuhan), eks = sum(withData, x => x.eksisting);
  confirm({
    title: `Hapus rumpun ${r === 'keahlian' ? 'Keahlian' : 'Keterampilan'}?`,
    body: `${withData.length} baris jenjang akan dihapus (kebutuhan ${keb}, eksisting ${eks}).`,
    onConfirm: () => setRumpun(node.id, next),
  });
}
```

---

## 5. Parent dropdown

```tsx
<Select
  value={parentOf(node.id)?.id ?? ''}
  options={[
    { value: '', label: '— Tidak ada atasan —' },
    ...validParentOptions(node.id).map(n => ({
      value: n.id,
      label: `${n.nomor ? n.nomor + ' · ' : ''}${n.nama}`,
      indent: depthOf(n.id),
    })),
  ]}
  onChange={id => setParent(node.id, id || null)}
  searchable
/>
```

`validParentOptions` already excludes cycle-forming choices (doc 04 §2).
`searchable` is not optional — a 400-position agency makes an unsearchable dropdown
unusable, and this is the only reparenting mechanism in MVP.

Options are indented by depth and prefixed with `nomor`, which turns a flat list
into something that reads like the structure. Two divisions named "Sekretariat" are
otherwise indistinguishable.

**Changing parent does not move the node.** Invariant 2. If the operator expects the
geometry to follow, Tidy is the answer — and after the first reparent, a one-time
hint says so.

**Placement convention (brief §4):** non-structural positions attach to the
**unit** node, as siblings of the head — never to the head. The dropdown
supports this softly: unit nodes sort above position nodes within each depth,
and selecting a structural position as parent for a JF/pelaksana node shows a
one-line hint suggesting the unit instead. Hint, not block — unusual structures
exist, and the convention's purpose is consistent export columns, not enforcement.

**Link and template panels:** a unit's panel gains "Jadikan tautan…" (only when
childless) and "Jadikan template…"; the replacement panel contents are
specified in doc 13 §5 and doc 15 §2. Positions inside a template subtree show
the chip picker as usual, but number inputs are replaced by per-column totals
linking to the instance grid (doc 15 §3).

---

## 6. Custom attributes

Rendered from `project.attributeSchema`, one control per type:

| `tipe` | Control |
|---|---|
| `text` | Single-line input |
| `number` | NumberInput, no min |
| `dropdown` | Select from `opsi` |
| `boolean` | Checkbox |
| `date` | Date input |
| `multiline` | Textarea, 3 rows |

```ts
onChange: v => updateNode(node.id, { custom: { ...node.custom, [attr.id]: v } },
                          `field:${node.id}:${attr.id}`)
```

Attribute *definitions* are edited elsewhere — a project settings dialog, not the
node panel. Mixing "define a field for the whole project" with "fill this node's
field" in one surface is how an operator accidentally adds a column while trying to
enter a value.

The schema editor generates `id` by slugifying `nama`, with collision suffixes:

```ts
function slugify(nama: string, existing: Set<string>): string {
  const base = nama.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  if (!existing.has(base)) return base;
  let i = 2; while (existing.has(`${base}_${i}`)) i++;
  return `${base}_${i}`;
}
```

Renaming an attribute must not regenerate its `id` — the id is a spreadsheet column
header that has already left the building in exported files.

---

## 7. Edge cases

**Type switched to `unit` while rows hold figures.** Invariant 1 requires discarding
them. Confirm with the totals named, then clear. This is the one destructive type
change and it must not be silent.

**Type switched to `jabatan`.** Seed one row with `jenjangId: null`, so the node is
immediately fillable rather than showing an empty table.

**Category cleared to empty.** `getJenjangOptions` returns `[]`, the picker hides,
and existing rows keep their `jenjangId` values — invalid, and flagged by
`JENJANG_INVALID`. Not nulled: the operator is mid-thought and will likely pick a
category next, and nulling would destroy recoverable state.

**Two rows with the same level after import.** The picker shows the chip active
once. `JENJANG_DUPLICATE` fires, and the editor shows both rows so the operator can
see and merge them. Auto-merging figures would silently alter totals.

**Multi-selection including both units and positions.** Bulk category-set applies
only to positions; the button label states the count it will affect
(*"Set kategori untuk 7 jabatan (3 unit dilewati)"*).

---

## 8. Exit criteria

- [ ] Chip picker shows every valid level for the node's category and tracks
- [ ] Activating a chip creates exactly one row; deactivating removes it
- [ ] Deactivating an empty row does not prompt
- [ ] Deactivating a row with figures prompts and names the figures
- [ ] Row order follows config order regardless of activation order
- [ ] Picker hidden for `pelaksana` and for functional with no track selected
- [ ] Category change preserves figures and nulls invalid levels, with confirmation
- [ ] Track deselection cascades row removal with a figure-naming confirmation
- [ ] Parent dropdown is searchable, indented, `nomor`-prefixed, and excludes
      cycle-forming options
- [ ] Changing parent leaves position unchanged
- [ ] `selisih` computed in render, absent from `OrgNode`
- [ ] Number stepper held down produces one history entry
- [ ] Empty selection shows project metadata
- [ ] Attribute `id` unchanged when the attribute is renamed
