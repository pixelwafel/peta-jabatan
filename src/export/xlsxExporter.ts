import * as XLSX from 'xlsx';
import { Project } from '@/models/project';
import { Recap } from '@/models/derived';
import { taxonomy } from '@/config/taxonomy';
import { COLUMNS, getCustomColumns } from './columnSpec';
import { buildExportRows } from './rowGenerator';

function forceTextFormat(ws: XLSX.WorkSheet, colIndex: number): void {
  if (colIndex < 0) return;
  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');

  for (let r = range.s.r + 1; r <= range.e.r; ++r) {
    const cellRef = XLSX.utils.encode_cell({ r, c: colIndex });
    const cell = ws[cellRef];
    if (cell) {
      cell.t = 's';
      cell.z = '@';
      if (cell.v !== undefined && cell.v !== null) {
        cell.v = String(cell.v);
      }
    }
  }
}

function buildReferensiSheet(): XLSX.WorkSheet {
  const rows: (string | number)[][] = [
    ['Kategori', 'ID Kategori', 'Jenjang', 'ID Jenjang', 'Singkatan'],
  ];

  for (const k of taxonomy.kategori) {
    if (!k.punyaRumpun) {
      for (const j of k.jenjang ?? []) {
        rows.push([k.nama, k.id, j.nama, j.id, j.singkatan]);
      }
    } else {
      if (k.rumpun?.keahlian) {
        for (const j of k.rumpun.keahlian) {
          rows.push([`${k.nama} (Keahlian)`, k.id, j.nama, j.id, j.singkatan]);
        }
      }
      if (k.rumpun?.keterampilan) {
        for (const j of k.rumpun.keterampilan) {
          rows.push([`${k.nama} (Keterampilan)`, k.id, j.nama, j.id, j.singkatan]);
        }
      }
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 22 }, { wch: 14 }, { wch: 20 }, { wch: 16 }, { wch: 10 }];
  return ws;
}

function buildRekapSheet(recap: Recap): XLSX.WorkSheet {
  const rows: (string | number)[][] = [
    ['REKAPITULASI PETA JABATAN'],
    [''],
    ['Summary Total OPD'],
    ['Label', 'Kebutuhan', 'Eksisting', 'Selisih', 'Jumlah Jabatan'],
    [
      recap.total.label,
      recap.total.kebutuhan,
      recap.total.eksisting,
      recap.total.selisih,
      recap.total.nodeCount,
    ],
  ];

  if (recap.unplaced.nodeCount > 0) {
    rows.push([
      recap.unplaced.label,
      recap.unplaced.kebutuhan,
      recap.unplaced.eksisting,
      recap.unplaced.selisih,
      recap.unplaced.nodeCount,
    ]);
  }

  rows.push(['']);
  rows.push(['Rekapitulasi Per Kategori']);
  rows.push(['Kategori', 'Kebutuhan', 'Eksisting', 'Selisih', 'Jumlah Jabatan']);
  for (const k of recap.perKategori) {
    rows.push([k.label, k.kebutuhan, k.eksisting, k.selisih, k.nodeCount]);
  }

  rows.push(['']);
  rows.push(['Rekapitulasi Per Jenjang Fungsional']);
  rows.push(['Jenjang', 'Kebutuhan', 'Eksisting', 'Selisih', 'Jumlah Row']);
  for (const j of recap.perJenjang) {
    rows.push([j.label, j.kebutuhan, j.eksisting, j.selisih, j.nodeCount]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 30 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 16 }];
  return ws;
}

function buildMetaSheet(project: Project): XLSX.WorkSheet {
  const rows = [
    ['Informasi Metadata Berkas Peta Jabatan'],
    ['Nama OPD', project.meta.namaOPD],
    ['Kode OPD', project.meta.kodeOPD],
    ['Penyusun', project.meta.penyusun],
    ['Tahun Anggaran', project.meta.tahunAnggaran ?? '—'],
    ['Keterangan', project.meta.keterangan ?? '—'],
    ['Schema Version', project.schemaVersion],
    ['Config Version', project.configVersion],
    ['Aplikasi Versi', typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0'],
    ['Tanggal Ekspor', new Date().toISOString()],
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 20 }, { wch: 40 }];
  return ws;
}

export function exportXlsx(project: Project, recap: Recap): Blob {
  const wb = XLSX.utils.book_new();
  const cols = [...COLUMNS, ...getCustomColumns(project.attributeSchema)];
  const rows = buildExportRows(project, recap, taxonomy);

  // Sheet 1: Struktur
  const headerRow = cols.map(c => c.header);
  const dataRows = rows.map(r => cols.map(c => c.get(r)));
  const aoa = [headerRow, ...dataRows];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = cols.map(c => ({ wch: c.width }));
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };

  // CRITICAL: Force text format on 'nomor' and 'kode' columns so '1.10' stays '1.10'!
  const nomorColIdx = cols.findIndex(c => c.key === 'nomor');
  const kodeColIdx = cols.findIndex(c => c.key === 'kode');

  if (nomorColIdx >= 0) forceTextFormat(ws, nomorColIdx);
  if (kodeColIdx >= 0) forceTextFormat(ws, kodeColIdx);

  XLSX.utils.book_append_sheet(wb, ws, 'Struktur');

  // Sheet 2: Referensi
  XLSX.utils.book_append_sheet(wb, buildReferensiSheet(), 'Referensi');

  // Sheet 3: Rekap
  XLSX.utils.book_append_sheet(wb, buildRekapSheet(recap), 'Rekap');

  // Sheet 4: Info
  XLSX.utils.book_append_sheet(wb, buildMetaSheet(project), 'Info');

  const arrayBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([arrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
