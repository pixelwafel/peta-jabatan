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
    get: c => c.cfg.labels[c.node.type] ?? c.node.type,
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
