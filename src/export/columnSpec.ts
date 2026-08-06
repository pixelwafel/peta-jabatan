import { OrgNode, Rincian } from '@/models/node';
import { NodeTotals } from '@/models/derived';
import { CustomAttribute } from '@/models/project';
import { Taxonomy, taxonomy } from '@/config/taxonomy';
import { getKategori, jenjangLabel } from '@/config/resolver';

export interface RowContext {
  node: OrgNode;
  rincian: Rincian | null; // null for unit rows
  parent: OrgNode | null;
  totals: NodeTotals; // subtree totals for units, own for positions
  cfg: Taxonomy;
  /** nomor unit template yang menaungi baris ini (docs/15-template-instance.md
   * §4) — kosong kalau baris ini bukan bagian subtree template mana pun. */
  templateNomor?: string;
}

export interface ColumnDef {
  key: string;
  header: string;
  width: number;
  importable: boolean; // false = informational only on re-import
  get: (ctx: RowContext) => string | number | null;
}

export const COLUMNS: ColumnDef[] = [
  {
    key: 'nomor',
    header: 'nomor',
    width: 10,
    importable: true,
    get: c => c.node.nomor,
  },
  {
    key: 'nama',
    header: 'nama',
    width: 34,
    importable: true,
    get: c => c.node.nama,
  },
  {
    key: 'tipe',
    header: 'tipe',
    width: 12,
    importable: true,
    // Link node tetap type: 'unit' di data model (docs/13-link-nodes.md §1),
    // tapi diekspor sebagai baris "Tautan" tersendiri supaya bisa di-import
    // balik jadi link, bukan unit kosong biasa.
    get: c => (c.node.link ? 'Tautan' : c.cfg.labels[c.node.type] ?? c.node.type),
  },
  {
    key: 'kategori',
    header: 'kategori',
    width: 14,
    importable: true,
    get: c => getKategori(c.node.kategoriId)?.nama ?? '',
  },
  {
    key: 'rumpun',
    header: 'rumpun',
    width: 16,
    importable: true,
    get: c =>
      c.node.rumpun
        .map(r => (r === 'keahlian' ? 'Keahlian' : 'Keterampilan'))
        .join(', '),
  },
  {
    key: 'jenjang',
    header: 'jenjang',
    width: 18,
    importable: true,
    get: c =>
      c.rincian?.jenjangId ? jenjangLabel(c.rincian.jenjangId, c.node.kategoriId) : '',
  },
  {
    key: 'kebutuhan',
    header: 'kebutuhan',
    width: 11,
    importable: true,
    get: c => (c.rincian ? c.rincian.kebutuhan : c.totals.kebutuhan),
  },
  {
    key: 'eksisting',
    header: 'eksisting',
    width: 11,
    importable: true,
    get: c => (c.rincian ? c.rincian.eksisting : c.totals.eksisting),
  },
  {
    key: 'selisih',
    header: 'selisih',
    width: 9,
    importable: false,
    get: c =>
      c.rincian ? c.rincian.eksisting - c.rincian.kebutuhan : c.totals.selisih,
  },
  {
    key: 'kode',
    header: 'kode',
    width: 14,
    importable: true,
    get: c => c.node.kode ?? '',
  },
  {
    key: 'unit_kerja',
    header: 'unit_kerja',
    width: 20,
    importable: true,
    get: c => c.node.unitKerja ?? '',
  },
  {
    key: 'keterangan',
    header: 'keterangan',
    width: 28,
    importable: true,
    get: c => c.node.keterangan ?? '',
  },
  {
    key: 'kepala_nama',
    header: 'kepala_nama',
    width: 28,
    importable: true,
    get: c => (c.node.type === 'unit' ? c.node.kepalaUnit?.nama ?? '' : ''),
  },
  {
    key: 'kepala_kode',
    header: 'kepala_kode',
    width: 14,
    importable: true,
    get: c => (c.node.type === 'unit' ? c.node.kepalaUnit?.kode ?? '' : ''),
  },
  {
    key: 'kepala_jenjang',
    header: 'kepala_jenjang',
    width: 18,
    importable: true,
    get: c =>
      c.node.type === 'unit' && c.node.kepalaUnit?.jenjangId
        ? jenjangLabel(c.node.kepalaUnit.jenjangId, 'struktural')
        : '',
  },
  {
    key: 'kepala_kebutuhan',
    header: 'kepala_kebutuhan',
    width: 15,
    importable: true,
    get: c => (c.node.type === 'unit' && c.node.kepalaUnit ? c.node.kepalaUnit.kebutuhan : ''),
  },
  {
    key: 'kepala_eksisting',
    header: 'kepala_eksisting',
    width: 15,
    importable: true,
    get: c => (c.node.type === 'unit' && c.node.kepalaUnit ? c.node.kepalaUnit.eksisting : ''),
  },
  {
    key: 'kode_tautan',
    header: 'kode_tautan',
    width: 16,
    importable: true,
    // Kode OPD project tujuan (docs/13-link-nodes.md §6) — hanya terisi untuk
    // baris tipe "Tautan". Angka kebutuhan/eksisting baris ini datang dari
    // totals (resolusi link, lihat selectors/recap.ts), bukan rincian lokal.
    get: c => c.node.link?.kodeOPD ?? '',
  },
  {
    key: 'template',
    header: 'template',
    width: 12,
    importable: true,
    // Nomor unit template yang menaungi baris ini (docs/15-template-instance.md
    // §4) — kosong kalau bukan bagian template. Angka kebutuhan/eksisting
    // baris ini SELALU nol di sini (invariant); angka sebenarnya ada di sheet
    // Satuan_<nomor> (export/matrixExporter.ts), bukan di sheet Struktur ini.
    get: c => c.templateNomor ?? '',
  },
  {
    key: 'parent_nomor',
    header: 'parent_nomor',
    width: 12,
    importable: false,
    get: c => c.parent?.nomor ?? '',
  },
  {
    key: 'parent_nama',
    header: 'parent_nama',
    width: 30,
    importable: false,
    get: c => c.parent?.nama ?? '',
  },
  {
    key: 'parent_id',
    header: 'parent_id',
    width: 36,
    importable: false,
    get: c => c.parent?.id ?? '',
  },
];

export function getCustomColumns(attributeSchema: CustomAttribute[] = []): ColumnDef[] {
  const reservedKeys = new Set(COLUMNS.map(c => c.key));

  return attributeSchema.map(attr => {
    let key = attr.id;
    if (reservedKeys.has(key)) {
      key = `${attr.id}_2`;
    }
    return {
      key,
      header: attr.nama,
      width: 16,
      importable: true,
      get: c => c.node.custom?.[attr.id] ?? '',
    };
  });
}
