import { Finding } from '@/models/derived';
import { CustomAttribute } from '@/models/project';

export interface ColumnMap {
  nomor?: number;
  nama?: number;
  tipe?: number;
  kategori?: number;
  rumpun?: number;
  jenjang?: number;
  kebutuhan?: number;
  eksisting?: number;
  kode?: number;
  unitKerja?: number;
  keterangan?: number;
  kepalaNama?: number;
  kepalaKode?: number;
  kepalaJenjang?: number;
  kepalaKebutuhan?: number;
  kepalaEksisting?: number;
  kodeTautan?: number;
  template?: number;
  custom?: Record<string, number>;
}

const COLUMN_ALIASES: Record<string, string[]> = {
  nomor: ['nomor', 'no', 'no.', 'kode hirarki', 'urutan'],
  nama: ['nama', 'nama jabatan', 'jabatan', 'nama unit'],
  tipe: ['tipe', 'tipe node', 'jenis'],
  kategori: ['kategori', 'kategori jabatan', 'status jabatan', 'jenis jabatan'],
  rumpun: ['rumpun', 'rumpun jabatan'],
  jenjang: ['jenjang', 'jenjang jabatan', 'eselon', 'kelas'],
  kebutuhan: ['kebutuhan', 'keb', 'jumlah kebutuhan', 'abk', 'formasi'],
  eksisting: ['eksisting', 'eks', 'existing', 'bezetting', 'terisi'],
  kode: ['kode', 'kode jabatan'],
  unitKerja: ['unit kerja', 'unit', 'satuan kerja'],
  keterangan: ['keterangan', 'catatan', 'ket'],
  kepalaNama: ['kepala nama', 'nama kepala', 'kepala unit', 'nama kepala unit'],
  kepalaKode: ['kepala kode', 'kode kepala', 'kode kepala unit'],
  kepalaJenjang: ['kepala jenjang', 'jenjang kepala', 'jenjang kepala unit', 'eselon kepala'],
  kepalaKebutuhan: ['kepala kebutuhan', 'kebutuhan kepala', 'keb kepala'],
  kepalaEksisting: ['kepala eksisting', 'eksisting kepala', 'eks kepala'],
  kodeTautan: ['kode_tautan', 'kode tautan'],
  template: ['template'],
};

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ');
}

export function detectHeaderRow(matrix: (string | number | null)[][]): number {
  const maxScan = Math.min(matrix.length, 10);

  for (let r = 0; r < maxScan; r++) {
    const row = matrix[r];
    if (!row || !Array.isArray(row)) continue;

    const normRow = row.map(c => normalize(String(c ?? '')));
    let matchCount = 0;

    for (const aliases of Object.values(COLUMN_ALIASES)) {
      if (normRow.some(cell => aliases.includes(cell))) {
        matchCount++;
      }
    }

    if (matchCount >= 3) {
      return r;
    }
  }

  return 0; // fallback to first row
}

export function mapColumns(
  headerRow: (string | number | null)[],
  schema: CustomAttribute[] = []
): { map: ColumnMap; findings: Finding[] } {
  const normHeaders = headerRow.map(h => normalize(String(h ?? '')));
  const map: ColumnMap = { custom: {} };
  const findings: Finding[] = [];

  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    const index = normHeaders.findIndex(h => aliases.includes(h));
    if (index >= 0) {
      (map as Record<string, unknown>)[field] = index;
    }
  }

  for (const attr of schema) {
    const normName = normalize(attr.nama);
    const index = normHeaders.findIndex(h => h === normName || h === normalize(attr.id));
    if (index >= 0) {
      map.custom![attr.id] = index;
    }
  }

  if (map.nomor === undefined) {
    findings.push({
      code: 'IMPORT_NO_NOMOR_COL',
      severity: 'error',
      message: `Kolom "nomor" tidak ditemukan. Header terbaca: [${headerRow
        .filter(Boolean)
        .join(', ')}]`,
    });
  }

  if (map.nama === undefined) {
    findings.push({
      code: 'IMPORT_NO_NAMA_COL',
      severity: 'error',
      message: `Kolom "nama" tidak ditemukan. Header terbaca: [${headerRow
        .filter(Boolean)
        .join(', ')}]`,
    });
  }

  return { map, findings };
}
