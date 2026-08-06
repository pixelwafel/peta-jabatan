import { OrgNode } from '@/models/node';
import { OrgEdge } from '@/models/edge';
import { Finding } from '@/models/derived';
import { detectHeaderRow, mapColumns } from './columnMapper';
import { parseRows } from './rowParser';
import { groupRows } from './groupRows';
import { buildStructure } from './buildStructure';
import { projectTotals } from '@/selectors/totals';
import { mergeStrukturalHeadsIntoUnits } from '@/utils/structuralMerge';
import { parseMatrixSheets, MatrixSummary } from './matrixImporter';
import { UnitInstance } from '@/models/project';

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
    /** Instance template (docs/15-template-instance.md §4) — dari sheet
     * Satuan_<nomor>, kalau ada. */
    instances?: UnitInstance[];
  };
  /** Ringkasan per sheet matrix (doc 15 §4 "per-matrix summary") — instance
   * count, jumlah kolom, total, dipakai preview impor. */
  matrixSummaries?: MatrixSummary[];
  /**
   * Metadata asli dari berkas sumber (docs/14-recap-dashboard.md §4 —
   * staging new/replace/older butuh kodeOPD & updatedAt yang SEBENARNYA,
   * bukan turunan nama file). Cuma terisi untuk impor JSON (yang membawa
   * `Project` lengkap) — impor XLSX tidak membawa kodeOPD di sheet
   * Struktur, jadi tetap memakai turunan nama file seperti sebelumnya.
   */
  sourceMeta?: { namaOPD: string; kodeOPD: string; updatedAt: string };
}

export async function processXlsxImport(file: File): Promise<ImportPreview> {
  const xlsx = await import('xlsx');
  const arrayBuffer = await file.arrayBuffer();
  const wb = xlsx.read(arrayBuffer, { type: 'array' });

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

  const matrix = xlsx.utils.sheet_to_json(ws, { header: 1 }) as (string | number | null)[][];
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
  const { nodes: builtNodes, edges: builtEdges, findings: structFindings } =
    buildStructure(candidates);

  // Stage 6: Fold legacy struktural-jabatan rows into their unit's kepalaUnit
  // (format lama: kepala unit ditulis sebagai baris Jabatan kategori Struktural)
  const merge = mergeStrukturalHeadsIntoUnits(builtNodes, builtEdges);
  const { nodes, edges } = merge;

  const mergeFindings: Finding[] =
    merge.leftoverIds.length > 0
      ? [
          {
            code: 'IMPORT_STRUKTURAL_NOT_MERGED',
            severity: 'warning',
            message: `${merge.leftoverIds.length} baris Jabatan berkategori Struktural tidak bisa otomatis digabung ke unit (kemungkinan lebih dari satu kepala per unit). Rapikan manual lewat Outline: pindahkan datanya ke bagian "Kepala Unit" pada properti unit, lalu hapus node Jabatan-nya.`,
          },
        ]
      : [];

  // Stage 7: Sheet Satuan_<nomor> per template unit (docs/15-template-instance.md
  // §4) — dibaca SETELAH struktur & merge legacy selesai, supaya isTemplate
  // & nomor node sudah final saat dicocokkan ke nama sheet.
  const { instances, findings: matrixFindings, summaries: matrixSummaries } =
    parseMatrixSheets(xlsx, wb, nodes, edges);

  const allFindings = [
    ...colFindings,
    ...parseFindings,
    ...groupFindings,
    ...structFindings,
    ...mergeFindings,
    ...matrixFindings,
  ];

  // IMPORT_MATRIX_TEMPLATE_NOT_FOUND sengaja error severity (kelihatan tegas
  // di daftar temuan) TAPI fatal-nya cuma untuk sheet itu sendiri (doc 15 §4)
  // — tidak boleh membatalkan commit seluruh Struktur yang sudah valid.
  const hasFatalError = allFindings.some(
    f => f.severity === 'error' && f.code !== 'IMPORT_MATRIX_TEMPLATE_NOT_FOUND'
  );

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
    built: { nodes, edges, instances: instances.length > 0 ? instances : undefined },
    matrixSummaries: matrixSummaries.length > 0 ? matrixSummaries : undefined,
  };
}
