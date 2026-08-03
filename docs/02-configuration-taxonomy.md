# 02 — Configuration & Taxonomy

## Purpose

Hold the entire position classification vocabulary in one bundled file, so that a
regulatory change is a config edit rather than a code change or a data migration.
This file is also the source for the XLSX template dropdowns, which is how a
centralized taxonomy is enforced without a backend.

---

## 1. File shape

`src/config/taxonomy.json`

```json
{
  "configVersion": "2026.1",
  "kategori": [
    {
      "id": "struktural",
      "nama": "Struktural",
      "warna": "#1e40af",
      "punyaRumpun": false,
      "jenjang": [
        { "id": "jpt_pratama",  "nama": "JPT Pratama",  "singkatan": "JPT" },
        { "id": "administrator","nama": "Administrator","singkatan": "Adm" },
        { "id": "pengawas",     "nama": "Pengawas",     "singkatan": "Pgw" }
      ]
    },
    {
      "id": "fungsional",
      "nama": "Fungsional",
      "warna": "#047857",
      "punyaRumpun": true,
      "rumpun": {
        "keahlian": [
          { "id": "ahli_utama",   "nama": "Ahli Utama",   "singkatan": "AU" },
          { "id": "ahli_madya",   "nama": "Ahli Madya",   "singkatan": "AMd" },
          { "id": "ahli_muda",    "nama": "Ahli Muda",    "singkatan": "AMu" },
          { "id": "ahli_pertama", "nama": "Ahli Pertama", "singkatan": "AP" }
        ],
        "keterampilan": [
          { "id": "penyelia", "nama": "Penyelia", "singkatan": "Pny" },
          { "id": "mahir",    "nama": "Mahir",    "singkatan": "Mhr" },
          { "id": "terampil", "nama": "Terampil", "singkatan": "Trm" },
          { "id": "pemula",   "nama": "Pemula",   "singkatan": "Pml" }
        ]
      }
    },
    {
      "id": "pelaksana",
      "nama": "Pelaksana",
      "warna": "#b45309",
      "punyaRumpun": false,
      "jenjang": []
    }
  ],
  "unitWarna": "#475569",
  "labels": {
    "unit": "Unit Organisasi",
    "jabatan": "Jabatan"
  }
}
```

> **Verify before shipping.** The level lists reproduce the working draft from the
> brief. They follow regulations that change — in particular the treatment of the
> *Pemula* level and the post-delayering structural nomenclature. Confirm against
> the Permenpan in force at implementation time and bump `configVersion`. The
> table is a placeholder, not an authority.

### Why levels nest under category

An operator selects a category first; the available levels follow. Nesting makes
that dependency structural rather than something the UI has to remember. A flat
level list with a `kategoriId` foreign key would work but invites the bug where a
structural node gets offered `ahli_muda`.

### `punyaRumpun` rather than checking `id === 'fungsional'`

Hard-coding the functional category by id defeats the purpose of the config. Any
category may later gain tracks. The flag says *this category's levels are split
into tracks*, and the resolver branches on the flag.

---

## 2. Types

```ts
interface Jenjang {
  id: string;
  nama: string;
  singkatan: string;      // for the compact node card breakdown
}

interface Kategori {
  id: string;
  nama: string;
  warna: string;          // hex, drives node card accent
  punyaRumpun: boolean;
  jenjang?: Jenjang[];              // when punyaRumpun === false
  rumpun?: Record<Rumpun, Jenjang[]>; // when punyaRumpun === true
}

interface Taxonomy {
  configVersion: string;
  kategori: Kategori[];
  unitWarna: string;
  labels: Record<NodeType, string>;
}
```

The config is loaded once at module scope and frozen. It is not part of store
state — only `configVersion` is persisted in the project.

```ts
import raw from './taxonomy.json';
export const taxonomy: Taxonomy = Object.freeze(raw as Taxonomy);
```

---

## 3. Resolver API

Every consumer goes through these. No component walks `taxonomy.kategori` itself.

```ts
getKategori(id?: string): Kategori | null
getKategoriList(): Kategori[]

/**
 * The authoritative source for the chip picker (doc 06) and the
 * template dropdown (doc 08). Returns levels valid for this exact
 * combination of category and tracks, in regulatory order (highest first).
 */
getJenjangOptions(kategoriId?: string, rumpun: Rumpun[] = []): Jenjang[]

getJenjang(kategoriId: string | undefined, jenjangId: string): Jenjang | null
jenjangLabel(jenjangId: string | null): string     // null → '—'
jenjangSingkatan(jenjangId: string | null): string

kategoriWarna(node: OrgNode): string               // includes unit case
isJenjangValid(kategoriId: string | undefined, rumpun: Rumpun[], jenjangId: string | null): boolean
```

### `getJenjangOptions` — the central function

```ts
function getJenjangOptions(kategoriId?: string, rumpun: Rumpun[] = []): Jenjang[] {
  const k = getKategori(kategoriId);
  if (!k) return [];

  if (!k.punyaRumpun) return k.jenjang ?? [];

  // Track-based category: concatenate the selected tracks in a fixed
  // order so the chip picker is stable regardless of selection order.
  const order: Rumpun[] = ['keahlian', 'keterampilan'];
  return order
    .filter(r => rumpun.includes(r))
    .flatMap(r => k.rumpun?.[r] ?? []);
}
```

Two behaviors worth stating explicitly:

**Empty result is meaningful.** A category with no levels (`pelaksana`) returns
`[]`, and a functional category with no track selected also returns `[]`. In both
cases the chip picker hides and the node falls back to a single unlabeled row.
Same downstream handling, no special case.

**Order is fixed, not selection-dependent.** If an operator selects
*keterampilan* then *keahlian*, the chips still render expertise-first. Chip
positions that move as tracks are toggled would make the picker feel unstable.

### `isJenjangValid` — used by import and by rumpun changes

```ts
function isJenjangValid(kategoriId, rumpun, jenjangId): boolean {
  if (jenjangId === null) {
    // An unlabeled row is valid only where no levels exist.
    return getJenjangOptions(kategoriId, rumpun).length === 0;
  }
  return getJenjangOptions(kategoriId, rumpun).some(j => j.id === jenjangId);
}
```

This is the guard that catches the awkward case in §5.

---

## 4. Label-to-id resolution (import only)

The XLSX template carries display labels, because that is what a human types and
what a dropdown shows. Import must map them back to ids, tolerantly — operators
paste from other documents and the casing and spacing will vary.

```ts
const normalize = (s: string) =>
  s.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[^a-z0-9 ]/g, '');

// Built once at module load.
const kategoriByLabel = new Map<string, string>();
const jenjangByLabel  = new Map<string, string>();   // key: `${kategoriId}|${label}`

for (const k of taxonomy.kategori) {
  kategoriByLabel.set(normalize(k.nama), k.id);
  kategoriByLabel.set(normalize(k.id), k.id);        // accept ids too
  for (const j of allJenjangOf(k)) {
    jenjangByLabel.set(`${k.id}|${normalize(j.nama)}`, j.id);
    jenjangByLabel.set(`${k.id}|${normalize(j.singkatan)}`, j.id);
    jenjangByLabel.set(`${k.id}|${normalize(j.id)}`, j.id);
  }
}

resolveKategori(label: string): string | null
resolveJenjang(kategoriId: string, label: string): string | null
```

Accepting the id, the full name, and the abbreviation costs three map entries and
removes an entire class of import failure. Being strict here would produce a
findings list full of `unknown category: "STRUKTURAL"` — technically correct,
practically useless.

Both resolvers return `null` on failure and the import builder emits a finding
with the row number and the unrecognized text. It does **not** guess. A wrong
category silently assigned is worse than a flagged one.

---

## 5. Edge cases

**Category changes on a node that has detail rows.** Existing `jenjangId` values
are almost certainly invalid for the new category. Behavior: keep the rows, keep
the figures, set every `jenjangId` to `null`, and emit a warning finding
(`JENJANG_RESET`). Deleting the figures would destroy work; keeping invalid ids
would corrupt the recap breakdown. Nulling preserves the numbers and makes the
gap visible.

**A track is deselected while its rows hold data.** The rows belonging to that
track become invalid. The property panel must confirm before removing them and
must state the figures involved: *"Menghapus rumpun Keterampilan akan menghapus 2
baris jenjang (kebutuhan 5, eksisting 3). Lanjutkan?"* Naming the numbers is what
makes the confirmation informative rather than a reflex click.

**`configVersion` mismatch on project load.** The project was entered under an
older taxonomy. Do not block, do not auto-migrate silently. Validate every
`kategoriId` and `jenjangId` against the current config; emit findings for
unrecognized ones; show a one-time banner naming both versions. Silent
auto-migration is how a level quietly becomes the wrong level.

**A level is removed from config between versions.** Existing data referencing it
keeps the id — the resolver returns `null`, and `jenjangLabel` must render the raw
id in brackets (`[ahli_pertama_lama]`) rather than an empty string. An operator
seeing a bracketed unknown label can act; one seeing a blank cell cannot.

---

## 6. Consumers

| Module | Uses |
|---|---|
| Property panel (06) | `getKategoriList`, `getJenjangOptions` for chips, `kategoriWarna` |
| Node card (05) | `kategoriWarna`, `jenjangSingkatan` for the compact breakdown |
| Recap (07) | `getKategoriList` for stable breakdown ordering, `jenjangLabel` |
| Import (08) | `resolveKategori`, `resolveJenjang`, `isJenjangValid` |
| Export (09) | `getKategori().nama`, `jenjangLabel` — files carry labels, not ids |
| Template builder (08) | `getKategoriList`, all levels — for data-validation lists |

Note the asymmetry in the export row: **files carry labels, ids stay internal.**
A spreadsheet full of `ahli_muda` is not a document an operator can work with. The
round trip works because import resolves labels back to ids tolerantly.

---

## 7. Exit criteria

- [ ] `taxonomy.json` loaded once, frozen, never in store state
- [ ] No component reads `taxonomy.kategori` directly; grep confirms resolver-only
      access
- [ ] `getJenjangOptions('fungsional', ['keterampilan','keahlian'])` returns
      expertise levels first
- [ ] `getJenjangOptions('pelaksana')` returns `[]` and the chip picker hides
- [ ] `resolveKategori` accepts `'Struktural'`, `'struktural'`, `'STRUKTURAL '`
- [ ] Changing a node's category nulls its `jenjangId` values and emits
      `JENJANG_RESET`
- [ ] Deselecting a track with data shows a confirmation naming the figures
- [ ] An unknown `jenjangId` renders bracketed, not blank
- [ ] Loading a project with an older `configVersion` produces a banner and
      per-node findings, and changes no data
