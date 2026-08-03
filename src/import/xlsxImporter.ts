import * as XLSX from 'xlsx';
import { OrgNode } from '@/models/node';
import { OrgEdge } from '@/models/edge';
import { Finding } from '@/models/derived';
import { detectHeaderRow, mapColumns } from './columnMapper';
import { parseRows } from './rowParser';
import { groupRows } from './groupRows';
import { buildStructure } from './buildStructure';
import { projectTotals } from '@/selectors/totals';

export interface ImportPreview {
  summary: {
    nodeCount: number;
    unitCount: number;
    jabatanCount: number;
    rincianCount: number;
    totalKebutuhan: number;
    totalEksisting: number;
    rowsRead: number;
    rowsSkipped: number;
  };
  findings: Finding[];
  sample: Array<{ nomor: string; nama: string; tipe: string; parent: string }>;
  canCommit: boolean;
  built: {
    nodes: OrgNode[];
    edges: OrgEdge[];
  };
}

export async function processXlsxImport(file: File): Promise<ImportPreview> {
  const arrayBuffer = await file.arrayBuffer();
  const wb = XLSX.read(arrayBuffer, { type: 'array' });

  const sheetName = wb.SheetNames.includes('Struktur')
    ? 'Struktur'
    : wb.SheetNames[0];

  const ws = wb.Sheets[sheetName];
  if (!ws) {
    return {
      summary: {
        nodeCount: 0,
        unitCount: 0,
        jabatanCount: 0,
        rincianCount: 0,
        totalKebutuhan: 0,
        totalEksisting: 0,
        rowsRead: 0,
        rowsSkipped: 0,
      },
      findings: [
        {
          code: 'IMPORT_EMPTY_FILE',
          severity: 'error',
          message: `Sheet "${sheetName}" tidak ditemukan atau berkas kosong.`,
        },
      ],
      sample: [],
      canCommit: false,
      built: { nodes: [], edges: [] },
    };
  }

  const matrix = XLSX.utils.sheet_to_json(ws, { header: 1 }) as (string | number | null)[][];
  if (!matrix || matrix.length === 0) {
    return {
      summary: {
        nodeCount: 0,
        unitCount: 0,
        jabatanCount: 0,
        rincianCount: 0,
        totalKebutuhan: 0,
        totalEksisting: 0,
        rowsRead: 0,
        rowsSkipped: 0,
      },
      findings: [
        {
          code: 'IMPORT_EMPTY_FILE',
          severity: 'error',
          message: 'Berkas tidak memiliki data baris.',
        },
      ],
      sample: [],
      canCommit: false,
      built: { nodes: [], edges: [] },
    };
  }

  // Stage 1: Detect header row
  const headerIndex = detectHeaderRow(matrix);
  const headerRow = matrix[headerIndex] ?? [];

  // Stage 2: Map columns
  const { map, findings: colFindings } = mapColumns(headerRow);
  if (colFindings.some(f => f.severity === 'error')) {
    return {
      summary: {
        nodeCount: 0,
        unitCount: 0,
        jabatanCount: 0,
        rincianCount: 0,
        totalKebutuhan: 0,
        totalEksisting: 0,
        rowsRead: matrix.length,
        rowsSkipped: matrix.length,
      },
      findings: colFindings,
      sample: [],
      canCommit: false,
      built: { nodes: [], edges: [] },
    };
  }

  // Stage 3: Parse rows
  const { rows, findings: parseFindings } = parseRows(matrix, map, headerIndex);

  // Stage 4: Group rows by nomor
  const { candidates, findings: groupFindings } = groupRows(rows);

  // Stage 5: Build structure & derive parents
  const { nodes, edges, findings: structFindings } = buildStructure(candidates);

  const allFindings = [
    ...colFindings,
    ...parseFindings,
    ...groupFindings,
    ...structFindings,
  ];

  const hasFatalError = allFindings.some(f => f.severity === 'error');

  const unitCount = nodes.filter(n => n.type === 'unit').length;
  const jabatanCount = nodes.filter(n => n.type === 'jabatan').length;
  const rincianCount = nodes.reduce((acc, n) => acc + n.rincian.length, 0);
  const totals = projectTotals(nodes);

  const nodeById = new Map(nodes.map(n => [n.id, n]));
  const parentIdMap = new Map(edges.map(e => [e.target, e.source]));

  const sample = nodes.slice(0, 15).map(n => {
    const pId = parentIdMap.get(n.id);
    const pNode = pId ? nodeById.get(pId) : null;
    return {
      nomor: n.nomor,
      nama: n.nama,
      tipe: n.type === 'unit' ? 'Unit' : 'Jabatan',
      parent: pNode ? `${pNode.nomor} (${pNode.nama})` : '—',
    };
  });

  return {
    summary: {
      nodeCount: nodes.length,
      unitCount,
      jabatanCount,
      rincianCount,
      totalKebutuhan: totals.kebutuhan,
      totalEksisting: totals.eksisting,
      rowsRead: matrix.length - headerIndex - 1,
      rowsSkipped: (matrix.length - headerIndex - 1) - rows.length,
    },
    findings: allFindings,
    sample,
    canCommit: !hasFatalError && nodes.length > 0,
    built: { nodes, edges },
  };
}
