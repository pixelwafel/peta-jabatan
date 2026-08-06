import { Project } from '@/models/project';
import { Recap, RecapBucket } from '@/models/derived';
import { ProjectIndex } from '@/persistence/types';
import { OpdEntry, resolveOpdEntry } from '@/config/daftarOpd';
import { computeTopLevel, sumTopLevelTotals, isEntryStale } from '@/selectors/dashboard';
import { computeGlobalBreakdown, GlobalBreakdownOptions } from '@/selectors/globalBreakdown';

/**
 * Fitur "Laporan" — dibahas & disepakati dengan pengguna sebelum dirancang
 * (bukan permintaan fitur dari docs/ manapun, murni kebutuhan presentasi ke
 * pimpinan). Keputusan produk yang mengikat desain modul ini:
 * - Audiens: pimpinan OPD/internal -> struktur & bahasa formal, bukan tabel
 *   teknis mentah.
 * - Format tetap XLSX, TANPA dependency baru (ExcelJS dkk ditolak) -> rapi
 *   di sini berarti rapi STRUKTUR/ISI (kop, subtotal jelas, urutan logis),
 *   BUKAN styling asli (bold/warna/border) — `xlsx` (SheetJS Community
 *   Edition) yang sudah dipakai project ini tidak mendukung cell styling
 *   sama sekali saat menulis, cuma lebar kolom/merge/hidden-row (lihat
 *   catatan yang sama di docs/09-export-pipeline.md §5.1). Konvensi
 *   penekanan visual yang dipakai murni ALL-CAPS pada judul section, sama
 *   seperti buildGovernmentRecapSheet di consolidatedExporter.ts.
 * - Snapshot kondisi SAAT INI saja — tidak ada infrastruktur riwayat/tren.
 * - File/tombol TERPISAH dari ekspor data mentah (xlsxExporter.ts,
 *   consolidatedExporter.ts) — laporan ini murni layer presentasi baru di
 *   atas selector yang SUDAH ADA (computeRecap, computeTopLevel,
 *   computeGlobalBreakdown), tidak ada logic agregasi baru.
 */

/** Persentase terisi (eksisting/kebutuhan) — dibulatkan 1 desimal, 0 kalau kebutuhan 0. */
export function pctTerisi(kebutuhan: number, eksisting: number): number {
  if (kebutuhan <= 0) return 0;
  return Math.round((eksisting / kebutuhan) * 1000) / 10;
}

function formatTanggalIndonesia(d: Date): string {
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

type Row = (string | number)[];

/** Baris judul section — ALL-CAPS sebagai penekanan visual tanpa styling asli (lihat catatan modul di atas). */
function sectionTitle(title: string): Row {
  return [title.toUpperCase()];
}

const BLANK: Row = [];

/**
 * Laporan ringkas satu OPD (docs internal — fitur "Laporan", bukan
 * xlsxExporter.ts). Satu sheet "Laporan": kop, ringkasan, rekap per
 * kategori/jenjang/unit, catatan (kalau ada tautan basi/unplaced), blok
 * pengesahan. Sumber angka murni `recap` yang sudah dihitung `computeRecap`
 * — tidak ada agregasi baru di sini.
 */
export async function exportLaporan(project: Project, recap: Recap): Promise<Blob> {
  const xlsx = await import('xlsx');
  const rows: Row[] = [];

  // --- Kop ---
  rows.push(['LAPORAN REKAPITULASI KEBUTUHAN & EKSISTING PEGAWAI']);
  rows.push(['Nama OPD', project.meta.namaOPD]);
  rows.push(['Kode OPD', project.meta.kodeOPD]);
  rows.push(['Tahun Anggaran', project.meta.tahunAnggaran ?? '-']);
  rows.push(['Disusun oleh', project.meta.penyusun || '-']);
  rows.push(['Tanggal Cetak', formatTanggalIndonesia(new Date())]);
  rows.push(BLANK);

  // --- Ringkasan ---
  rows.push(sectionTitle('Ringkasan'));
  rows.push(['Total Kebutuhan', recap.total.kebutuhan]);
  rows.push(['Total Eksisting', recap.total.eksisting]);
  rows.push(['Selisih', recap.total.selisih]);
  rows.push(['% Terisi', `${pctTerisi(recap.total.kebutuhan, recap.total.eksisting)}%`]);
  rows.push(['Jumlah Jabatan', recap.total.nodeCount]);
  if (recap.unplaced.nodeCount > 0) {
    rows.push(['Catatan', `${recap.unplaced.nodeCount} jabatan belum ditempatkan pada hirarki unit.`]);
  }
  rows.push(BLANK);

  // --- Per Kategori ---
  rows.push(sectionTitle('Rekapitulasi per Kategori'));
  rows.push(['Kategori', 'Kebutuhan', 'Eksisting', 'Selisih', '% Terisi']);
  for (const b of recap.perKategori) {
    rows.push([b.label, b.kebutuhan, b.eksisting, b.selisih, `${pctTerisi(b.kebutuhan, b.eksisting)}%`]);
  }
  rows.push(BLANK);

  // --- Per Jenjang ---
  if (recap.perJenjang.length > 0) {
    rows.push(sectionTitle('Rekapitulasi per Jenjang'));
    rows.push(['Jenjang', 'Kebutuhan', 'Eksisting', 'Selisih']);
    for (const b of recap.perJenjang) {
      rows.push([b.label, b.kebutuhan, b.eksisting, b.selisih]);
    }
    rows.push(BLANK);
  }

  // --- Per Unit ---
  rows.push(sectionTitle('Rekapitulasi per Unit'));
  rows.push(['Unit', 'Kebutuhan', 'Eksisting', 'Selisih', 'Jumlah Jabatan']);
  for (const b of recap.perUnit) {
    // Indentasi disimulasikan lewat prefix teks (bukan styling asli — lihat
    // catatan modul di atas soal batasan SheetJS CE).
    const label = '  '.repeat(b.depth ?? 0) + b.label;
    rows.push([label, b.kebutuhan, b.eksisting, b.selisih, b.nodeCount]);
  }
  rows.push(BLANK);

  // --- Catatan (kondisional) ---
  const cachedUnits = recap.perUnit.filter(b => b.includesCached);
  if (cachedUnits.length > 0) {
    rows.push(sectionTitle('Catatan'));
    for (const b of cachedUnits) {
      rows.push([
        `- "${b.label}" menyertakan angka tautan yang belum tentu terbaru${
          b.oldestCachedAsOf ? ` (per ${formatTanggalIndonesia(new Date(b.oldestCachedAsOf))})` : ''
        }.`,
      ]);
    }
    rows.push(BLANK);
  }

  // --- Blok pengesahan ---
  rows.push(BLANK);
  rows.push(BLANK);
  rows.push(['Mengetahui,', '', '', 'Disusun oleh,']);
  rows.push(BLANK);
  rows.push(BLANK);
  rows.push(BLANK);
  rows.push(['( ......................................... )', '', '', `( ${project.meta.penyusun || '.........................................'} )`]);

  const ws = xlsx.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 40 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 12 }];

  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, 'Laporan');

  const arrayBuffer = xlsx.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([arrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

export interface LaporanPemerintahOptions extends GlobalBreakdownOptions {
  /** Fase 2.3 — RecapDashboard.tsx sudah menghitung breakdown per-kategori
   * ini sendiri (lewat worker, lihat workers/client.ts) untuk tampilan
   * "Per Kategori (Se-Pemda)"-nya. Kalau di-pass, dipakai apa adanya dan
   * `computeGlobalBreakdown` (loop baca N body project) TIDAK dijalankan
   * ulang di sini — laporan cuma mem-format ulang angka yang sama. */
  precomputedBreakdown?: RecapBucket[];
}

/**
 * Laporan ringkas se-pemda (konsolidasi semua OPD tersimpan). Reuse penuh
 * selector dashboard yang sudah ada (computeTopLevel — termasuk double-count
 * guard, sumTopLevelTotals, isEntryStale, computeGlobalBreakdown) — tidak
 * ada agregasi baru. `readProject`/`opdIndex` di-pass sebagai parameter
 * (bukan import langsung dari persistence/storage) supaya pure/testable
 * tanpa IndexedDB, pola yang sama seperti consolidatedExporter.ts.
 */
export async function buildLaporanPemerintahWorkbook(
  fullIndex: ProjectIndex,
  opdIndex: Map<string, OpdEntry>,
  readProject: (id: string) => Promise<Project | null>,
  opts: LaporanPemerintahOptions = {}
): Promise<Blob> {
  const xlsx = await import('xlsx');
  const { topLevel, doubleLinked } = computeTopLevel(fullIndex.entries);
  const totals = sumTopLevelTotals(topLevel);
  const staleCount = topLevel.filter(isEntryStale).length;
  const problemCount = topLevel.filter(e => (e.findingCounts?.errors ?? 0) > 0).length;
  const breakdown = opts.precomputedBreakdown ?? (await computeGlobalBreakdown(topLevel, readProject, opts));

  const rows: Row[] = [];

  // --- Kop ---
  rows.push(['LAPORAN REKAPITULASI KEBUTUHAN & EKSISTING PEGAWAI SE-PEMERINTAH DAERAH']);
  rows.push(['Pemerintah Daerah', '']); // diisi manual — tidak ada field nama-pemda di data model
  rows.push(['Tanggal Cetak', formatTanggalIndonesia(new Date())]);
  rows.push(['Jumlah OPD Tercatat', topLevel.length]);
  rows.push(BLANK);

  // --- Ringkasan ---
  rows.push(sectionTitle('Ringkasan'));
  rows.push(['Total Kebutuhan', totals.kebutuhan]);
  rows.push(['Total Eksisting', totals.eksisting]);
  rows.push(['Selisih', totals.selisih]);
  rows.push(['% Terisi', `${pctTerisi(totals.kebutuhan, totals.eksisting)}%`]);
  rows.push(['OPD Data Basi (>30 hari)', staleCount]);
  rows.push(['OPD Bermasalah (ada error validasi)', problemCount]);
  rows.push(BLANK);

  // --- Per Kategori se-pemda ---
  rows.push(sectionTitle('Rekapitulasi per Kategori Se-Pemda'));
  rows.push(['Kategori', 'Kebutuhan', 'Eksisting', 'Selisih']);
  for (const b of breakdown) {
    rows.push([b.label, b.kebutuhan, b.eksisting, b.selisih]);
  }
  rows.push(BLANK);

  // --- Per OPD ---
  rows.push(sectionTitle('Rekapitulasi per OPD'));
  rows.push(['Kode', 'Nama OPD', 'Kelompok', 'Kebutuhan', 'Eksisting', 'Selisih', '% Terisi', 'Status Data']);
  const sortedTopLevel = topLevel.slice().sort((a, b) => a.namaOPD.localeCompare(b.namaOPD, 'id'));
  for (const e of sortedTopLevel) {
    const opd = resolveOpdEntry(e.kodeOPD, opdIndex);
    rows.push([
      e.kodeOPD,
      e.namaOPD,
      opd?.kelompok ?? 'Lainnya',
      e.totalKebutuhan,
      e.totalEksisting,
      e.totalEksisting - e.totalKebutuhan,
      `${pctTerisi(e.totalKebutuhan, e.totalEksisting)}%`,
      isEntryStale(e) ? 'Basi (>30 hari)' : 'Terkini',
    ]);
  }
  rows.push(BLANK);

  // --- Catatan ---
  if (doubleLinked.length > 0) {
    rows.push(sectionTitle('Catatan'));
    rows.push([`- ${doubleLinked.length} project ditautkan oleh lebih dari satu OPD (perlu dirapikan agar tidak ambigu).`]);
    rows.push(BLANK);
  }

  // --- Blok pengesahan ---
  rows.push(BLANK);
  rows.push(BLANK);
  rows.push(['Mengetahui,', '', '', 'Disusun oleh,']);
  rows.push(BLANK);
  rows.push(BLANK);
  rows.push(BLANK);
  rows.push(['( ......................................... )', '', '', '( ......................................... )']);

  const ws = xlsx.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 16 }, { wch: 34 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 14 }];

  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, 'Laporan Se-Pemda');

  const arrayBuffer = xlsx.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([arrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
