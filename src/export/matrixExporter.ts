import type * as XLSX from 'xlsx';
import { Project } from '@/models/project';
import { OrgNode } from '@/models/node';
import { buildColumnGroups } from '@/selectors/templateInstance';

// Fase 1.8 — lihat catatan di xlsxExporter.ts: import type saja (bebas
// runtime cost), nilai xlsx dioper dari pemanggil yang sudah men-dynamic-
// import modulnya (xlsxExporter.ts, consolidatedExporter.ts).
type XlsxModule = typeof XLSX;

/** Nama sheet Excel maksimal 31 karakter, tanpa karakter : \ / ? * [ ]. */
function sheetNameFor(templateNode: OrgNode): string {
  const raw = `Satuan_${templateNode.nomor || templateNode.id.slice(0, 8)}`;
  return raw.replace(/[:\\/?*[\]]/g, '-').slice(0, 31);
}

/**
 * Sheet matrix satu template unit (docs/15-template-instance.md §4):
 *
 * ```
 * row 0 (hidden): '', ''    , rincianId , rincianId , ...   <- kunci kolom pasti, dipakai import (M12.9)
 * row 1:          satuan,kode, Nama Posisi (merged span)   , ...
 * row 2:          '', ''    , K/level·K , E/level·E , ...
 * row 3+:         nama, kode, kebutuhan , eksisting , ...
 * ```
 *
 * Baris 0 disembunyikan (`!rows[0].hidden`) — kalau file dibuka manual di
 * Excel dan header baris 1/2 diubah, import tetap bisa memetakan kolom
 * dengan tepat lewat rincianId; kalau baris 0 hilang (file dibangun manual),
 * import fallback ke pencocokan nama+level (M12.9).
 */
export function buildMatrixSheet(
  xlsx: XlsxModule,
  project: Project,
  templateNode: OrgNode
): { name: string; sheet: XLSX.WorkSheet } {
  const groups = buildColumnGroups(templateNode.id, project.nodes, project.edges);
  const instances = (project.instances ?? []).filter(i => i.templateNodeId === templateNode.id);

  const row0: (string | number)[] = ['', ''];
  const row1: (string | number)[] = ['satuan', 'kode'];
  const row2: (string | number)[] = ['', ''];
  const merges: XLSX.Range[] = [];
  const flatKeys: string[] = [];

  let colIndex = 2;
  for (const g of groups) {
    const startCol = colIndex;
    for (const c of g.columns) {
      row0.push(c.key, c.key);
      row2.push(c.label ? `${c.label}·K` : 'K', c.label ? `${c.label}·E` : 'E');
      flatKeys.push(c.key);
      colIndex += 2;
    }
    const span = g.columns.length * 2;
    row1.push(g.label, ...Array(span - 1).fill(''));
    if (span > 1) {
      merges.push({ s: { r: 1, c: startCol }, e: { r: 1, c: startCol + span - 1 } });
    }
  }

  const dataRows = instances.map(inst => {
    const row: (string | number)[] = [inst.nama, inst.kode ?? ''];
    for (const key of flatKeys) {
      const fig = inst.figures[key] ?? { kebutuhan: 0, eksisting: 0 };
      row.push(fig.kebutuhan, fig.eksisting);
    }
    return row;
  });

  const aoa = [row0, row1, row2, ...dataRows];
  const sheet = xlsx.utils.aoa_to_sheet(aoa);
  sheet['!merges'] = merges;
  sheet['!rows'] = [{ hidden: true }];
  sheet['!cols'] = [{ wch: 28 }, { wch: 14 }, ...flatKeys.flatMap(() => [{ wch: 9 }, { wch: 9 }])];

  return { name: sheetNameFor(templateNode), sheet };
}

/** Satu sheet matrix per template unit di project ini (bisa lebih dari satu, doc 15 §6). */
export function buildMatrixSheets(
  xlsx: XlsxModule,
  project: Project
): Array<{ name: string; sheet: XLSX.WorkSheet }> {
  return project.nodes
    .filter(n => n.isTemplate)
    .map(templateNode => buildMatrixSheet(xlsx, project, templateNode));
}

export { sheetNameFor as matrixSheetNameFor };
