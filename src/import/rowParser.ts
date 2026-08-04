import { Finding } from '@/models/derived';
import { parseNomor } from '@/utils/numbering';
import { ColumnMap } from './columnMapper';

export interface RawRow {
  rowNumber: number; // 1-based spreadsheet row
  nomor: string;
  nama: string;
  tipe?: string;
  kategori?: string;
  rumpun?: string;
  jenjang?: string;
  kebutuhan?: string;
  eksisting?: string;
  kode?: string;
  unitKerja?: string;
  keterangan?: string;
  kepalaNama?: string;
  kepalaKode?: string;
  kepalaJenjang?: string;
  kepalaKebutuhan?: string;
  kepalaEksisting?: string;
  custom: Record<string, string>;
}

export function coerceInt(
  raw: string | number | undefined | null,
  rowNumber: number,
  field: string,
  findings: Finding[]
): number {
  if (raw === null || raw === undefined) return 0;
  if (typeof raw === 'number') {
    if (raw < 0) {
      findings.push({
        code: 'IMPORT_NEGATIVE',
        severity: 'warning',
        rowNumber,
        field,
        message: `Baris ${rowNumber}: ${field} negatif (${raw}). Dianggap 0.`,
      });
      return 0;
    }
    return Math.round(raw);
  }

  const s = String(raw).trim();
  if (s === '' || s === '-') return 0;

  // Handle Indonesian thousand separator and decimal comma: 1.234 -> 1234, 1,5 -> 1.5
  const cleaned = s.replace(/\./g, '').replace(',', '.');
  const n = Number(cleaned);

  if (!Number.isFinite(n)) {
    findings.push({
      code: 'IMPORT_BAD_NUMBER',
      severity: 'error',
      rowNumber,
      field,
      message: `Baris ${rowNumber}: ${field} "${s}" bukan angka. Dianggap 0.`,
    });
    return 0;
  }

  if (n < 0) {
    findings.push({
      code: 'IMPORT_NEGATIVE',
      severity: 'warning',
      rowNumber,
      field,
      message: `Baris ${rowNumber}: ${field} negatif (${s}). Dianggap 0.`,
    });
    return 0;
  }

  if (!Number.isInteger(n)) {
    const rounded = Math.round(n);
    findings.push({
      code: 'IMPORT_NOT_INTEGER',
      severity: 'warning',
      rowNumber,
      field,
      message: `Baris ${rowNumber}: ${field} "${s}" dibulatkan ke ${rounded}.`,
    });
    return rounded;
  }

  return n;
}

export function parseRows(
  matrix: (string | number | null)[][],
  map: ColumnMap,
  headerIndex: number
): { rows: RawRow[]; findings: Finding[] } {
  const rows: RawRow[] = [];
  const findings: Finding[] = [];

  for (let i = headerIndex + 1; i < matrix.length; i++) {
    const cells = matrix[i];
    if (!cells || cells.every(c => c === null || String(c).trim() === '')) {
      continue; // blank row
    }

    const rowNumber = i + 1;
    const nomor = map.nomor !== undefined ? String(cells[map.nomor] ?? '').trim() : '';
    const nama = map.nama !== undefined ? String(cells[map.nama] ?? '').trim() : '';

    if (!nomor && !nama) continue;

    if (!nomor) {
      findings.push({
        code: 'IMPORT_NO_NOMOR',
        severity: 'error',
        rowNumber,
        message: `Baris ${rowNumber}: "${nama}" tidak memiliki nomor. Baris dilewati.`,
      });
      continue;
    }

    if (!parseNomor(nomor)) {
      findings.push({
        code: 'IMPORT_BAD_NOMOR',
        severity: 'error',
        rowNumber,
        message: `Baris ${rowNumber}: nomor "${nomor}" tidak valid. Gunakan format 1, 1.1, 1.1.2.`,
      });
      continue;
    }

    const customValues: Record<string, string> = {};
    if (map.custom) {
      for (const [attrId, colIdx] of Object.entries(map.custom)) {
        customValues[attrId] = String(cells[colIdx] ?? '').trim();
      }
    }

    rows.push({
      rowNumber,
      nomor,
      nama,
      tipe: map.tipe !== undefined ? String(cells[map.tipe] ?? '').trim() : undefined,
      kategori: map.kategori !== undefined ? String(cells[map.kategori] ?? '').trim() : undefined,
      rumpun: map.rumpun !== undefined ? String(cells[map.rumpun] ?? '').trim() : undefined,
      jenjang: map.jenjang !== undefined ? String(cells[map.jenjang] ?? '').trim() : undefined,
      kebutuhan:
        map.kebutuhan !== undefined ? String(cells[map.kebutuhan] ?? '').trim() : undefined,
      eksisting:
        map.eksisting !== undefined ? String(cells[map.eksisting] ?? '').trim() : undefined,
      kode: map.kode !== undefined ? String(cells[map.kode] ?? '').trim() : undefined,
      unitKerja:
        map.unitKerja !== undefined ? String(cells[map.unitKerja] ?? '').trim() : undefined,
      keterangan:
        map.keterangan !== undefined ? String(cells[map.keterangan] ?? '').trim() : undefined,
      kepalaNama:
        map.kepalaNama !== undefined ? String(cells[map.kepalaNama] ?? '').trim() : undefined,
      kepalaKode:
        map.kepalaKode !== undefined ? String(cells[map.kepalaKode] ?? '').trim() : undefined,
      kepalaJenjang:
        map.kepalaJenjang !== undefined
          ? String(cells[map.kepalaJenjang] ?? '').trim()
          : undefined,
      kepalaKebutuhan:
        map.kepalaKebutuhan !== undefined
          ? String(cells[map.kepalaKebutuhan] ?? '').trim()
          : undefined,
      kepalaEksisting:
        map.kepalaEksisting !== undefined
          ? String(cells[map.kepalaEksisting] ?? '').trim()
          : undefined,
      custom: customValues,
    });
  }

  return { rows, findings };
}
