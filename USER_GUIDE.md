# Panduan Pengguna — Peta Jabatan Builder

Selamat datang di **Peta Jabatan Builder**! Panduan ini dirancang untuk membantu penyusun Peta Jabatan dan Analisis Beban Kerja (ABK) di Perangkat Daerah (OPD) dalam mengoperasikan aplikasi berbasis web ini secara efektif.

---

## 📑 Daftar Isi

1. [Mulai Cepat (Quickstart)](#1-mulai-cepat-quickstart)
2. [Navigasi Antarmuka & Kanvas](#2-navigasi-antarmuka--kanvas)
3. [Mengelola Node Unit & Jabatan](#3-mengelola-node-unit--jabatan)
4. [Mengisi Angka Kebutuhan & Eksisting (Rincian Jenjang)](#4-mengisi-angka-kebutuhan--eksisting-rincian-jenjang)
5. [Membaca Panel Rekapitulasi (Recap Engine)](#5-membaca-panel-rekapitulasi-recap-engine)
6. [Pemeriksaan Kesiapan Data & Validasi](#6-pemeriksaan-kesiapan-data--validasi)
7. [Mengekspor & Mengimpor Berkas (Excel, CSV, JSON, PNG)](#7-mengekspor--mengimpor-berkas-excel-csv-json-png)
8. [Pengelolaan Proyek & Penyimpanan Otomatis](#8-pengelolaan-proyek--penyimpanan-otomatis)
9. [Pintasan Papan Ketik (Keyboard Shortcuts)](#9-pintasan-papan-ketik-keyboard-shortcuts)

---

## 1. Mulai Cepat (Quickstart)

Saat pertama kali membuka aplikasi, Anda akan disajikan proyek default **Dinas Sekretariat Daerah** atau proyek kosong.

1. **Mengubah Nama & Metadata OPD**:
   - Pastikan tidak ada node yang terpilih di kanvas (klik area kosong kanvas).
   - Di panel kanan (Properti), isi **Nama OPD**, **Kode OPD**, **Penyusun**, dan **Tahun Anggaran**.
2. **Menambah Jabatan Baru**:
   - Klik tombol **+ Tambah** pada Toolbar atas.
   - Pilih tipe **Jabatan**, lalu tentukan atasan (Unit/Jabatan) pada panel Properti.
3. **Mengisi Kebutuhan & Eksisting**:
   - Klik kartu jabatan di kanvas.
   - Aktifkan jenjang yang sesuai dengan mengklik chip jenjang (misal: *Ahli Muda*, *Ahli Pertama*).
   - Masukkan angka **Kebutuhan** dan **Eksisting** pada tabel rincian.

---

## 2. Navigasi Antarmuka & Kanvas

Antarmuka terdiri dari 3 bagian utama:
- **Panel Kiri (Kategori Tabs)**:
  - **Struktur**: Menampilkan pohon hirarki organisasi (Tree View). Klik baris untuk memfokuskan kanvas ke node tersebut.
  - **Unplaced**: Daftar jabatan yang belum memiliki atasan (orphan/stray). Anda dapat memilih atasan secara cepat lewat dropdown di panel ini.
  - **Rekap**: Rekapitulasi angka kebutuhan, eksisting, dan selisih per unit, per kategori, dan per jenjang.
- **Kanvas Tengah (Editor Visual)**:
  - **Geser Kanvas (Pan)**: Klik dan tahan mouse di area kosong lalu geser.
  - **Perbesar/Perkecil (Zoom)**: Gunakan scroll wheel mouse atau tombol zoom di sudut kiri bawah kanvas.
  - **Merapikan Layout (Auto-Layout)**: Klik tombol **Rapikan** pada Toolbar untuk menata ulang posisi seluruh kartu secara rapi menggunakan algoritma Dagre.
- **Panel Kanan (Properti & Detail)**:
  - Menampilkan form identitas node, penentuan atasan, kategori jabatan, chip jenjang, dan tabel rincian angka.

---

## 3. Mengelola Node Unit & Jabatan

Peta Jabatan membedakan 2 jenis node:
1. **Unit Organisasi (Folder 📁)**:
   - Digunakan untuk Sekretariat, Bidang, Subbag, Subbid, Seksi, UPTD, Balai, dsb.
   - **Aturan Penting**: Node Unit **TIDAK BOLEH** memiliki angka kebutuhan/eksisting sendiri. Angka pada Unit dihitung otomatis dari akumulasi seluruh jabatan di bawahnya (*bottom-up aggregate*).
2. **Jabatan (Dokumen 📄)**:
   - Digunakan untuk Jabatan Struktural (Kepala Dinas, Kabid, Kasubbag), Jabatan Fungsional (Dokter, Guru, Analis), dan Jabatan Pelaksana (Pengadministrasi Umum).
   - Memiliki kategori (**Struktural**, **Fungsional**, **Pelaksana**) dan rincian jenjang.

### Cara Menentukan Atasan (Parent-Child)
- Klik node jabatan/unit di kanvas.
- Pada panel Properti kanan, pilih **Atasan (Parent Node)**.
- Aplikasi secara otomatis menyaring pilihan agar **tidak terjadi hubungan melingkar (cycle prevention)**.

---

## 4. Mengisi Angka Kebutuhan & Eksisting (Rincian Jenjang)

### Penggunaan Chip Picker Jenjang:
- Untuk **Jabatan Fungsional**, chip jenjang valid sesuai kategori dan rumpun (*Keahlian* atau *Keterampilan*) akan muncul di panel kanan.
- Klik chip jenjang (misal: `+ Ahli Muda`) untuk menambahkan baris rincian. Baris akan otomatis terurut sesuai standar regulasi.
- **Menghapus Jenjang**: Klik chip jenjang yang aktif untuk menonaktifkan.
  - Jika angka rincian `0` Kebutuhan dan `0` Eksisting, baris akan dihapus tanpa konfirmasi.
  - Jika angka rincian memiliki nilai (misal: Keb 3, Eks 2), modal konfirmasi akan muncul menyebutkan jumlah angka yang akan hilang.

### Perhitungan Selisih:
- Selisih dihitung otomatis: `Selisih = Eksisting - Kebutuhan`.
- **Warna Selisih**:
  - 🔴 **Merah (Negatif)**: Kekurangan pegawai (Kebutuhan > Eksisting).
  - ⚪ **Netral (Nol)**: Kebutuhan terpenuhi pas.
  - 🟡 **Kuning/Amber (Positif)**: Kelebihan pegawai (Eksisting > Kebutuhan).

---

## 5. Membaca Panel Rekapitulasi (Recap Engine)

Buka tab **Rekap** pada panel kiri untuk melihat ringkasan:
1. **TOTAL OPD**: Total kebutuhan, eksisting, dan selisih seluruh instansi.
2. **Belum Ditempatkan**: Peringatan jika ada jabatan yang belum dipasang di bawah unit.
3. **Rekapitulasi Per Unit**: Menampilkan total akumulasi per unit kerja secara berjenjang (*indented*). Klik baris unit untuk memfokuskan kanvas ke unit tersebut.
4. **Rekapitulasi Per Kategori**: Break-down angka untuk kategori *Struktural*, *Fungsional*, *Pelaksana*, dan *Belum berkategori*.
5. **Rekapitulasi Per Jenjang**: Break-down angka per tingkat jenjang fungsional (misal *Ahli Madya*, *Ahli Muda*, *Ahli Pertama*).

---

## 6. Pemeriksaan Kesiapan Data & Validasi

Aplikasi dilengkapi engine validasi otomatis yang memeriksa lebih dari 20 aturan integritas data.

- Klik tombol **Cek Kesiapan** di Toolbar atas.
- Modal akan menampilkan status kesiapan data:
  - 🟢 **SIAP DIEKSPOR**: Tidak ada kesalahan kritis.
  - 🔴 **BELUM SIAP (ADA KESALAHAN)**: Terdapat kesalahan yang perlu diperbaiki (misal: duplikasi nomor, unit memiliki rincian sendiri, dsb).
- Klik salah satu item temuan untuk memfokuskan kanvas ke node yang bermasalah.

---

## 7. Mengekspor & Mengimpor Berkas (Excel, CSV, JSON, PNG)

### Mengekspor Berkas
1. Klik tombol **Ekspor** di Toolbar atas.
2. Pilih format yang diinginkan (dapat memilih lebih dari satu bersamaan):
   - **Excel (.xlsx)**: Berkas spreadsheet lengkap 4 lembar (*Struktur*, *Referensi*, *Rekap*, *Info*). Format kolom `nomor` diproteksi sebagai teks agar `1.10` tidak terkonversi menjadi `1.1`.
   - **CSV (.csv)**: File teks berformat BOM UTF-8 dan CRLF agar dapat dibuka di Excel tanpa karakter rusak.
   - **JSON (.json)**: Cadangan (*backup*) penuh struktur proyek.
   - **Gambar PNG (.png)**: Tangkapan gambar kanvas struktur organisasi secara utuh (pilihan skala 1x, 2x, 3x dan latar belakang putih/transparan).
3. Klik **Ekspor Berkas**.

### Mengimpor Berkas
1. Klik tombol **Proyek** -> **Impor Berkas** (atau klik Ekspor/Impor pada dialog Kelola Proyek).
2. Pilih file `.xlsx` atau `.json`.
3. Aplikasi akan menampilkan **Pratinjau Impor** memuat ringkasan node, total kebutuhan, dan daftar temuan impor.
4. Klik **Impor ke Proyek Baru** untuk memuat data ke kanvas.

---

## 8. Pengelolaan Proyek & Penyimpanan Otomatis

- **Penyimpanan Otomatis (Autosave)**: Setiap perubahan yang Anda buat disimpan secara otomatis ke IndexedDB browser dengan jeda 500ms.
- **Deteksi Konflik Tab**: Jika Anda membuka proyek yang sama di dua tab browser bersamaan, sistem akan menampilkan peringatan agar perubahan tidak saling menimpa.
- **Kelola Proyek**: Klik tombol **Proyek** di Toolbar untuk membuat proyek baru, menduplikasi proyek, mencari proyek, atau menghapus proyek lama.
  - *Catatan*: Penghapusan proyek yang belum pernah diekspor memerlukan konfirmasi pengetikan nama OPD secara pasti demi keamanan data.

---

## 9. Pintasan Papan Ketik (Keyboard Shortcuts)

| Pintasan Ketik | Aksi |
|---|---|
| `Ctrl + Z` | Batalkan perubahan (*Undo*) |
| `Ctrl + Y` / `Ctrl + Shift + Z` | Ulangi perubahan (*Redo*) |
| `Ctrl + E` | Buka dialog Ekspor Berkas |
| `Escape` | Menutup dialog modal yang terbuka |

---

*Peta Jabatan Builder — Penyusunan Peta Jabatan & ABK Perangkat Daerah Cepat, Tepat, dan Akurat.*
