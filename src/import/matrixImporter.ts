import type * as XLSX from 'xlsx';
import { OrgNode } from '@/models/node';
import { OrgEdge } from '@/models/edge';
import { UnitInstance } from '@/models/project';
import { Finding } from '@/models/derived';
import { buildColumnGroups } from '@/selectors/templateInstance';
import { coerceInt } from './rowParser';
import { uuid } from '@/utils/uuid';

// Fase 1.8 — lihat catatan di export/xlsxExporter.ts. `xlsx` dioper dari
// xlsxImporter.ts, yang sudah men-dynamic-import modulnya untuk XLSX.read().
type XlsxModule = typeof XLSX;

const MATRIX_SHEET_PREFIX = 'Satuan_';

export interface MatrixSummary {
  sheetName: string;
  templateNomor: string;
  instanceCount: number;
  columnCount: number;
  totalKebutuhan: number;
  totalEksisting: number;
}

export interface MatrixImportResult {
  instances: UnitInstance[];
  findings: Finding[];
  summaries: MatrixSummary[];
}

/**
 * Baca sheet Satuan_<nomor> balik ke UnitInstance[] (docs/15-template-instance.md
 * §4). Dua jalur pencocokan kolom:
 * - **hidden-id**: baris tersembunyi berisi rincianId/id-unit persis — dipakai
 *   kalau nilainya cocok dengan kolom yang benar-benar ada di struktur hasil
 *   impor sheet Struktur (jadi tetap benar walau label header diedit manual).
 * - **label fallback**: kalau baris hidden hilang (file dibangun manual),
 *   cocokkan nama grup (baris 1) + label level (baris 2, tanpa akhiran ·K/·E)
 *   ke label posisi/level yang ada di struktur — toleran huruf besar/kecil.
 *
 * Sheet yang nomor template-nya tidak ada di Struktur gagal HANYA untuk
 * sheet itu (fatal-for-that-sheet-only, doc §4) — sheet lain & baris
 * Struktur tetap diproses normal.
 */
export function parseMatrixSheets(
  xlsx: XlsxModule,
  wb: XLSX.WorkBook,
  nodes: OrgNode[],
  edges: OrgEdge[]
): MatrixImportResult {
  const instances: UnitInstance[] = [];
  const findings: Finding[] = [];
  const summaries: MatrixSummary[] = [];

  const matrixSheetNames = wb.SheetNames.filter(n => n.startsWith(MATRIX_SHEET_PREFIX));

  for (const sheetName of matrixSheetNames) {
    const nomorSuffix = sheetName.slice(MATRIX_SHEET_PREFIX.length);
    const templateNode = nodes.find(n => n.isTemplate && n.nomor === nomorSuffix);

    if (!templateNode) {
      findings.push({
        code: 'IMPORT_MATRIX_TEMPLATE_NOT_FOUND',
        severity: 'error',
        message: `Sheet "${sheetName}" merujuk nomor template "${nomorSuffix}" yang tidak ada di sheet Struktur — sheet ini dilewati, sheet lain tetap diproses.`,
      });
      continue;
    }

    const sheet = wb.Sheets[sheetName];
    const matrix = xlsx.utils.sheet_to_json(sheet, { header: 1 }) as (string | number | null)[][];

    const satuanRowIndex = matrix.findIndex(row => String(row?.[0] ?? '').trim().toLowerCase() === 'satuan');
    if (satuanRowIndex === -1) {
      findings.push({
        code: 'IMPORT_MATRIX_TEMPLATE_NOT_FOUND',
        severity: 'error',
        message: `Sheet "${sheetName}" tidak punya baris header "satuan" yang dikenali — sheet ini dilewati.`,
      });
      continue;
    }

    const hasHiddenRow = satuanRowIndex > 0;
    const row0 = hasHiddenRow ? matrix[satuanRowIndex - 1] : null;
    const row1 = matrix[satuanRowIndex] ?? [];
    const row2 = matrix[satuanRowIndex + 1] ?? [];
    const dataStart = satuanRowIndex + 2;

    const groups = buildColumnGroups(templateNode.id, nodes, edges);
    const expectedKeys = new Set(groups.flatMap(g => g.columns.map(c => c.key)));

    // Forward-fill nama grup (merged cell terbaca kosong di kolom lanjutannya)
    const filledGroupLabel: string[] = [];
    let lastLabel = '';
    for (let i = 2; i < row1.length; i++) {
      const v = String(row1[i] ?? '').trim();
      if (v) lastLabel = v;
      filledGroupLabel.push(lastLabel);
    }

    const numDataCols = Math.max(0, row1.length - 2);
    const pairCount = Math.floor(numDataCols / 2);
    const columnKeys: (string | null)[] = [];
    const unmatchedHeaders: string[] = [];

    for (let pair = 0; pair < pairCount; pair++) {
      const colK = 2 + pair * 2;
      const colE = colK + 1;
      const idK = row0 ? String(row0[colK] ?? '').trim() : '';
      const idE = row0 ? String(row0[colE] ?? '').trim() : '';

      if (idK && idK === idE && expectedKeys.has(idK)) {
        columnKeys.push(idK);
        continue;
      }

      const groupLabel = (filledGroupLabel[pair * 2] ?? '').trim().toLowerCase();
      const subLabelK = String(row2[colK] ?? '').trim();
      const levelText = subLabelK.replace(/·k$/i, '').replace(/^k$/i, '').trim().toLowerCase();

      const matchedGroup = groups.find(g => g.label.trim().toLowerCase() === groupLabel);
      const matchedCol = !matchedGroup
        ? undefined
        : matchedGroup.columns.length === 1
        ? matchedGroup.columns[0]
        : matchedGroup.columns.find(c => c.label.trim().toLowerCase() === levelText);

      if (!matchedCol) {
        columnKeys.push(null);
        unmatchedHeaders.push(`${filledGroupLabel[pair * 2] ?? ''} ${subLabelK}`.trim() || `kolom ${pair + 1}`);
        continue;
      }
      columnKeys.push(matchedCol.key);
    }

    for (const header of unmatchedHeaders) {
      findings.push({
        code: 'IMPORT_MATRIX_UNMATCHED_COLUMN',
        severity: 'warning',
        message: `Sheet "${sheetName}": kolom "${header}" tidak cocok dengan posisi/level manapun di struktur — dilewati.`,
      });
    }

    let instanceCount = 0;
    let totalKebutuhan = 0;
    let totalEksisting = 0;

    for (let r = dataStart; r < matrix.length; r++) {
      const row = matrix[r];
      if (!row || row.every(c => c === null || String(c ?? '').trim() === '')) continue;

      const nama = String(row[0] ?? '').trim();
      if (!nama) continue;
      const kode = String(row[1] ?? '').trim() || undefined;

      const figures: UnitInstance['figures'] = {};
      for (let pair = 0; pair < pairCount; pair++) {
        const key = columnKeys[pair];
        if (!key) continue;
        const kebutuhan = coerceInt(row[2 + pair * 2], r + 1, `${sheetName}:kebutuhan`, findings);
        const eksisting = coerceInt(row[2 + pair * 2 + 1], r + 1, `${sheetName}:eksisting`, findings);
        figures[key] = { kebutuhan, eksisting };
        totalKebutuhan += kebutuhan;
        totalEksisting += eksisting;
      }

      instances.push({ id: uuid(), templateNodeId: templateNode.id, nama, kode, figures });
      instanceCount++;
    }

    summaries.push({
      sheetName,
      templateNomor: nomorSuffix,
      instanceCount,
      columnCount: pairCount,
      totalKebutuhan,
      totalEksisting,
    });
  }

  return { instances, findings, summaries };
}
