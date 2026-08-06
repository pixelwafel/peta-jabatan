import * as XLSX from 'xlsx';
import { Project } from '@/models/project';
import { ProjectIndex, ProjectIndexEntry } from '@/persistence/types';
import { COLUMNS, getCustomColumns } from './columnSpec';
import { buildExportRows } from './rowGenerator';
import { computeRecap } from '@/selectors/recap';
import { taxonomy } from '@/config/taxonomy';
import { slug } from './filename';
import { computeTopLevel, sumTopLevelTotals } from '@/selectors/dashboard';

function forceTextFormat(ws: XLSX.WorkSheet, colIndex: number): void {
  if (colIndex < 0) return;
  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
  for (let r = range.s.r + 1; r <= range.e.r; ++r) {
    const cellRef = XLSX.utils.encode_cell({ r, c: colIndex });
    const cell = ws[cellRef];
    if (cell) {
      cell.t = 's';
      cell.z = '@';
      if (cell.v !== undefined && cell.v !== null) cell.v = String(cell.v);
    }
  }
}

/**
 * Consolidated numbering (docs/13-link-nodes.md §6): nomor link node di
 * project induk jadi prefiks nomor project yang ditautkan. Link `1.4` +
 * target `1.1` -> `1.4.1.1`. Dihitung murni di export ini — tidak ada
 * apa pun yang di-renumber di file aslinya.
 */
export function prefixNomor(linkNomor: string, childNomor: string): string {
  if (!linkNomor) return childNomor;
  if (!childNomor) return linkNomor;
  return `${linkNomor}.${childNomor}`;
}

function uniqueSheetName(wb: XLSX.WorkBook, base: string): string {
  const trimmedBase = (base || 'Sheet').slice(0, 31);
  let name = trimmedBase;
  let i = 2;
  const existing = new Set(wb.SheetNames);
  while (existing.has(name)) {
    const suffix = `_${i++}`;
    name = trimmedBase.slice(0, 31 - suffix.length) + suffix;
  }
  return name;
}

function buildProjectSheet(project: Project, index: ProjectIndex, nomorPrefix?: string): XLSX.WorkSheet {
  const recap = computeRecap(project, taxonomy, index);
  const cols = [...COLUMNS, ...getCustomColumns(project.attributeSchema)];
  const rows = buildExportRows(project, recap, taxonomy);

  const headerRow = cols.map(c => c.header);
  const dataRows = rows.map(r =>
    cols.map(c => {
      const v = c.get(r);
      return c.key === 'nomor' && nomorPrefix ? prefixNomor(nomorPrefix, String(v ?? '')) : v;
    })
  );

  const ws = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows]);
  ws['!cols'] = cols.map(c => ({ wch: c.width }));

  const nomorColIdx = cols.findIndex(c => c.key === 'nomor');
  const kodeColIdx = cols.findIndex(c => c.key === 'kode');
  if (nomorColIdx >= 0) forceTextFormat(ws, nomorColIdx);
  if (kodeColIdx >= 0) forceTextFormat(ws, kodeColIdx);

  return ws;
}

function buildGovernmentRecapSheet(topLevel: ProjectIndexEntry[]): XLSX.WorkSheet {
  const totals = sumTopLevelTotals(topLevel);
  const rows: (string | number)[][] = [
    ['REKAP PEMERINTAH — KONSOLIDASI PETA JABATAN'],
    [''],
    ['Total Kebutuhan', totals.kebutuhan],
    ['Total Eksisting', totals.eksisting],
    ['Selisih', totals.selisih],
    ['Jumlah OPD (top-level)', topLevel.length],
    [''],
    ['Kode OPD', 'Nama OPD', 'Kebutuhan', 'Eksisting', 'Selisih', 'Diubah'],
    ...topLevel
      .slice()
      .sort((a, b) => a.namaOPD.localeCompare(b.namaOPD, 'id'))
      .map(e => [
        e.kodeOPD,
        e.namaOPD,
        e.totalKebutuhan,
        e.totalEksisting,
        e.totalEksisting - e.totalKebutuhan,
        e.updatedAt,
      ]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 16 }, { wch: 34 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 22 }];
  return ws;
}

export interface ConsolidatedExportOptions {
  onProgress?: (done: number, total: number) => void;
}

/**
 * Ekspor konsolidasi (docs/14-recap-dashboard.md §5): satu workbook — satu
 * sheet rekap pemerintah, satu sheet per project top-level (doc 14 §2 double-
 * count guard: hanya top-level, project yang ditautkan TIDAK dobel jadi
 * sheet-nya sendiri DI LUAR konteks parent-nya), dan satu sheet per project
 * yang ditautkan langsung di bawah parent-nya di urutan penulisan workbook,
 * nomornya diprefiks nomor node tautan (docs/13 §6).
 *
 * `readProject` di-pass sebagai parameter supaya fungsi ini pure/testable
 * tanpa IndexedDB — sama seperti selectors/globalBreakdown.ts.
 */
export async function buildConsolidatedWorkbook(
  fullIndex: ProjectIndex,
  readProject: (id: string) => Promise<Project | null>,
  opts: ConsolidatedExportOptions = {}
): Promise<Blob> {
  const { topLevel, linkedUnder } = computeTopLevel(fullIndex.entries);
  const entryById = new Map(fullIndex.entries.map(e => [e.id, e]));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildGovernmentRecapSheet(topLevel), 'Rekap Pemerintah');

  const total = topLevel.length + Array.from(linkedUnder.values()).reduce((n, list) => n + list.length, 0);
  let done = 0;

  for (const parentEntry of topLevel) {
    const parentProject = await readProject(parentEntry.id);

    if (parentProject) {
      const sheetName = uniqueSheetName(wb, slug(parentEntry.kodeOPD).toUpperCase() || parentEntry.kodeOPD);
      XLSX.utils.book_append_sheet(wb, buildProjectSheet(parentProject, fullIndex), sheetName);

      for (const childId of linkedUnder.get(parentEntry.id) ?? []) {
        const childEntry = entryById.get(childId);
        const childProject = childEntry ? await readProject(childEntry.id) : null;

        if (childEntry && childProject) {
          const linkNode = parentProject.nodes.find(n => n.link?.kodeOPD === childEntry.kodeOPD);
          const childSheetName = uniqueSheetName(
            wb,
            `${slug(parentEntry.kodeOPD)}_${slug(childEntry.kodeOPD)}`.toUpperCase()
          );
          XLSX.utils.book_append_sheet(wb, buildProjectSheet(childProject, fullIndex, linkNode?.nomor), childSheetName);
        }

        done++;
        opts.onProgress?.(done, total);
      }
    }

    done++;
    opts.onProgress?.(done, total);
  }

  const arrayBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([arrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
