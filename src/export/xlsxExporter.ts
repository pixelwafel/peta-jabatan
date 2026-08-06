import * as XLSX from 'xlsx';
import { Project } from '@/models/project';
import { Recap } from '@/models/derived';
import { taxonomy } from '@/config/taxonomy';
import { COLUMNS, getCustomColumns } from './columnSpec';
import { buildExportRows } from './rowGenerator';
import { buildMatrixSheets } from './matrixExporter';

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

function buildPetunjukSheet(): XLSX.WorkSheet {
  const rows: (string | number)[][] = [
    ['Petunjuk Pengisian Template Peta Jabatan'],
    [''],
    ['1. Kolom "nomor" wajib diisi format hirarkis: 1, 1.1, 1.1.1, dst. Ini menentukan struktur atasan-bawahan.'],
    ['   Baris dengan nomor "1.2" otomatis jadi anak dari baris bernomor "1".'],
    ['2. Kolom "tipe" diisi "Unit" (unit organisasi, boleh punya anak) atau "Jabatan" (posisi, angka kebutuhan/eksisting).'],
    ['   Boleh dikosongkan — aplikasi akan menebak dari konteks, tapi lebih aman diisi eksplisit.'],
    ['3. Kolom "kategori" khusus baris bertipe Jabatan, diisi Fungsional atau Pelaksana (lihat sheet "Referensi").'],
    ['   Jabatan struktural (kepala unit) TIDAK dibuat sebagai baris Jabatan — lihat poin 6.'],
    ['4. Kolom "rumpun" khusus kategori Fungsional, diisi Keahlian dan/atau Keterampilan (pisahkan dengan koma bila keduanya).'],
    ['5. Kolom "jenjang" diisi nama jenjang sesuai kombinasi kategori+rumpun — lihat pilihan valid di sheet "Referensi".'],
    ['6. Kepala unit (posisi struktural) diisi LANGSUNG di baris Unit lewat kolom kepala_nama, kepala_kode, kepala_jenjang,'],
    ['   kepala_kebutuhan, kepala_eksisting — bukan baris Jabatan terpisah. kepala_jenjang diisi salah satu jenjang Struktural'],
    ['   di sheet "Referensi" (JPT Pratama / Administrator / Pengawas). kepala_nama boleh dikosongkan (default "Kepala {nama unit}").'],
    ['7. Kolom "kebutuhan" dan "eksisting" (bukan kepala_*) hanya berlaku untuk baris Jabatan, harus angka bulat >= 0.'],
    ['   Baris Unit tidak boleh diisi kolom ini — angka unit dihitung otomatis dari kepala unit + total jabatan di bawahnya.'],
    ['8. Kolom "kode", "unit_kerja", dan "keterangan" bersifat opsional, bebas diisi teks apa saja.'],
    ['9. Baris contoh di sheet "Struktur" boleh dihapus/ditimpa — hanya sebagai contoh format, bukan data wajib.'],
    ['10. Kolom "kode_tautan" khusus baris bertipe "Tautan" (docs/13-link-nodes.md) — diisi kode OPD proyek yang'],
    ['    ingin ditautkan (mis. proyek Puskesmas ditautkan dari struktur Dinas Kesehatan). Baris Tautan tidak'],
    ['    boleh punya anak; kolom kebutuhan/eksisting-nya dikosongkan karena angkanya diambil otomatis dari'],
    ['    proyek tujuan saat kode_tautan cocok dengan proyek yang tersimpan di aplikasi.'],
    ['11. Kolom "template" khusus baris bertipe Unit yang ingin dijadikan template (docs/15-template-instance.md,'],
    ['    contoh kasus: satu struktur sekolah dipakai berulang oleh banyak sekolah). Isi dengan nomor unit itu'],
    ['    sendiri (sama seperti kolom "nomor" di baris yang sama) untuk menandainya sebagai template. Baris Unit/'],
    ['    Jabatan di BAWAH unit template wajib kebutuhan/eksisting/kepala_kebutuhan/kepala_eksisting = 0 — angka'],
    ['    sesungguhnya per sekolah/instance diisi lewat tab "Satuan" di aplikasi setelah diimpor, bukan di sini.'],
    ['12. Setelah selesai, simpan berkas ini dan impor lewat Kelola Proyek → Impor Berkas.'],
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 100 }];
  return ws;
}

/**
 * Template kosong (berisi contoh singkat) untuk diisi manual lalu diimpor
 * lewat ImportDialog — bukan turunan dari proyek tertentu.
 */
export function exportXlsxTemplate(): Blob {
  const wb = XLSX.utils.book_new();
  const importableCols = COLUMNS.filter(c => c.importable);

  const headerRow = importableCols.map(c => c.header);
  // Urutan kolom mengikuti COLUMNS (importable saja): nomor, nama, tipe,
  // kategori, rumpun, jenjang, kebutuhan, eksisting, kode, unit_kerja,
  // keterangan, kepala_nama, kepala_kode, kepala_jenjang, kepala_kebutuhan,
  // kepala_eksisting, kode_tautan, template.
  //
  // Kepala unit (struktural) DIISI LANGSUNG di baris Unit lewat kolom
  // kepala_* — TIDAK dibuat sebagai baris Jabatan terpisah. Baris Jabatan
  // hanya untuk Fungsional & Pelaksana.
  //
  // Baris 6 (Tautan) & baris 7-9 (template + subtree-nya) adalah contoh
  // untuk fitur docs/13-link-nodes.md & docs/15-template-instance.md — lihat
  // poin 10 & 11 sheet "Petunjuk". Boleh dihapus kalau tidak dipakai.
  const sampleRows: (string | number)[][] = [
    ['1', 'Dinas Contoh', 'Unit', '', '', '', '', '', 'DIS.01', '', '', 'Kepala Dinas Contoh', 'KADIS.01', 'JPT Pratama', 1, 1, '', ''],
    ['1.1', 'Sekretariat', 'Unit', '', '', '', '', '', '', '', '', 'Sekretaris', 'SEK.01', 'Administrator', 1, 1, '', ''],
    ['1.2', 'Bidang Contoh', 'Unit', '', '', '', '', '', '', '', '', '', 'KAB.01', 'Pengawas', 1, 1, '', ''],
    ['1.2.1', 'Analis Kebijakan', 'Jabatan', 'Fungsional', 'Keahlian', 'Ahli Muda', 2, 1, '', '', '', '', '', '', '', '', '', ''],
    ['1.2.2', 'Pengadministrasi Umum', 'Jabatan', 'Pelaksana', '', '', 1, 0, '', '', '', '', '', '', '', '', '', ''],
    ['1.3', 'Puskesmas Kota Timur', 'Tautan', '', '', '', '', '', '', '', '', '', '', '', '', '', 'PKM-KTIM', ''],
    ['1.4', 'SD Contoh (Template)', 'Unit', '', '', '', '', '', '', '', '', '', '', '', 0, 0, '', '1.4'],
    ['1.4.1', 'Guru Kelas', 'Jabatan', 'Fungsional', 'Keahlian', 'Ahli Pertama', 0, 0, '', '', '', '', '', '', '', '', '', ''],
  ];

  const aoa = [headerRow, ...sampleRows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = importableCols.map(c => ({ wch: c.width }));
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };

  const nomorColIdx = importableCols.findIndex(c => c.key === 'nomor');
  const kodeColIdx = importableCols.findIndex(c => c.key === 'kode');
  if (nomorColIdx >= 0) forceTextFormat(ws, nomorColIdx);
  if (kodeColIdx >= 0) forceTextFormat(ws, kodeColIdx);

  XLSX.utils.book_append_sheet(wb, buildPetunjukSheet(), 'Petunjuk');
  XLSX.utils.book_append_sheet(wb, ws, 'Struktur');
  XLSX.utils.book_append_sheet(wb, buildReferensiSheet(), 'Referensi');

  const arrayBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([arrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
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

  // Sheet 5+: Satuan_<nomor> per template unit (docs/15-template-instance.md §4)
  // — struktur (kolom kosong, tipe 'template') sudah ada di sheet Struktur;
  // angka sebenarnya per satuan hidup di sini.
  for (const { name, sheet } of buildMatrixSheets(project)) {
    XLSX.utils.book_append_sheet(wb, sheet, name);
  }

  const arrayBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([arrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
