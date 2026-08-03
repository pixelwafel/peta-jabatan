import { Project } from '@/models/project';
import { Recap } from '@/models/derived';
import { taxonomy } from '@/config/taxonomy';
import { COLUMNS, getCustomColumns } from './columnSpec';
import { buildExportRows } from './rowGenerator';

export function exportCsv(
  project: Project,
  recap: Recap,
  delimiter: ',' | ';' = ','
): Blob {
  const cols = [...COLUMNS, ...getCustomColumns(project.attributeSchema)];
  const rows = buildExportRows(project, recap, taxonomy);

  const esc = (v: unknown) => {
    let s = v === null || v === undefined ? '' : String(v);
    // Neutralize CSV/formula injection: spreadsheet apps execute leading
    // =, +, -, @ (and tab/CR) as a formula when the CSV is opened.
    if (/^[=+\-@\t\r]/.test(s)) {
      s = `'${s}`;
    }
    if (s.includes('"') || s.includes(delimiter) || s.includes('\n') || s.includes('\r')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const headerLine = cols.map(c => esc(c.header)).join(delimiter);
  const dataLines = rows.map(r => cols.map(c => esc(c.get(r))).join(delimiter));

  const csvContent = '\uFEFF' + [headerLine, ...dataLines].join('\r\n');
  return new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
}
