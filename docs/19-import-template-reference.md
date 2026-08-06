# 19 — Referensi Format Template Impor (untuk normalisasi data mentah oleh AI/LLM)

> **Tujuan dokumen ini**: jadi rujukan teknis presisi ketika sebuah model AI/LLM
> diminta menormalisasi file data mentah (CSV/XLSX hasil ekspor sistem lain,
> rekap manual, dsb.) menjadi file yang siap diimpor ke aplikasi Peta Jabatan.
> Ini BUKAN dokumen desain fitur (lihat `08-import-pipeline.md`,
> `13-link-nodes.md`, `15-template-instance.md` untuk itu) — ini adalah
> spesifikasi **format output** yang harus dihasilkan, ditulis selengkap dan
> se-presisi mungkin supaya bisa dipakai sebagai instruksi langsung ke LLM lain
> tanpa perlu membaca kode sumber.
>
> Sumber kebenaran kode: `src/export/columnSpec.ts` (definisi kolom),
> `src/import/columnMapper.ts` (alias header yang dikenali saat impor),
> `src/import/rowParser.ts` + `src/import/groupRows.ts` (parsing & pembentukan
> node), `src/config/taxonomy.json` (daftar kategori/rumpun/jenjang valid),
> `src/export/matrixExporter.ts` + `src/import/matrixImporter.ts` (sheet
> Satuan_&lt;nomor&gt;). Kalau ada perbedaan antara dokumen ini dan kode, kode
> yang menang — dokumen ini perlu diperbarui.

## 1. Bentuk file yang diterima

- **XLSX** (disarankan) — satu sheet berisi tabel data, nama sheet bebas
  (importer men-scan semua sheet dan mengambil yang polanya cocok; kalau ragu,
  pakai nama sheet **"Struktur"**).
- **CSV** juga diterima untuk struktur dasar (tanpa fitur Tautan/Template lewat
  CSV — itu perlu XLSX karena butuh sheet tambahan `Satuan_<nomor>`).
- Header boleh ada di baris manapun di antara 1–10 baris pertama — pendeteksi
  header (`detectHeaderRow`) menghitung baris yang paling banyak cocok dengan
  alias kolom dikenal (§2). Kalau ragu, **taruh header di baris pertama**.
- File tidak harus punya semua kolom di §2 — hanya `nomor` dan `nama` yang
  wajib. Kolom lain yang tidak ada di file dianggap kosong untuk semua baris.

## 2. Kolom yang dikenali (satu baris = satu node)

Setiap baris tabel jadi satu node (Unit, Jabatan, atau Tautan). Kolom
ditemukan lewat **pencarian nama header case-insensitive**, dengan alias di
bawah (semua alias dinormalisasi: huruf kecil, non-alfanumerik jadi spasi).
**Nama header persis yang dipakai file ekspor asli app** ada di kolom
"Header baku"; pakai itu kalau menulis file dari nol supaya paling aman.

| Field internal | Header baku | Alias lain yang dikenali | Wajib? | Isi |
|---|---|---|---|---|
| `nomor` | `nomor` | `no`, `no.`, `kode hirarki`, `urutan` | **Ya** | Nomor hirarkis, lihat §3 |
| `nama` | `nama` | `nama jabatan`, `jabatan`, `nama unit` | **Ya** | Nama unit/posisi |
| `tipe` | `tipe` | `tipe node`, `jenis` | Tidak (ditebak kalau kosong, §4) | `Unit Organisasi` \| `Jabatan` \| `Tautan` (lihat §4) |
| `kategori` | `kategori` | `kategori jabatan`, `status jabatan`, `jenis jabatan` | Hanya untuk baris Jabatan | `Struktural` \| `Fungsional` \| `Pelaksana` (lihat §5) |
| `rumpun` | `rumpun` | `rumpun jabatan` | Hanya Fungsional | `Keahlian` dan/atau `Keterampilan` (pisah koma bila dua-duanya) |
| `jenjang` | `jenjang` | `jenjang jabatan`, `eselon`, `kelas` | Disarankan | Nama jenjang, lihat §5 untuk daftar valid per kategori/rumpun |
| `kebutuhan` | `kebutuhan` | `keb`, `jumlah kebutuhan`, `abk`, `formasi` | Hanya baris Jabatan | Bilangan bulat ≥ 0 |
| `eksisting` | `eksisting` | `eks`, `existing`, `bezetting`, `terisi` | Hanya baris Jabatan | Bilangan bulat ≥ 0 |
| `kode` | `kode` | `kode jabatan` | Tidak | Teks bebas (kode posisi internal) |
| `unit_kerja` | `unit_kerja` | `unit kerja`, `unit`, `satuan kerja` | Tidak | Teks bebas |
| `keterangan` | `keterangan` | `catatan`, `ket` | Tidak | Teks bebas |
| `kepala_nama` | `kepala_nama` | `kepala nama`, `nama kepala`, `kepala unit`, `nama kepala unit` | Tidak | Nama kepala unit — HANYA di baris Unit, lihat §6 |
| `kepala_kode` | `kepala_kode` | `kepala kode`, `kode kepala`, `kode kepala unit` | Tidak | Kode posisi kepala unit |
| `kepala_jenjang` | `kepala_jenjang` | `kepala jenjang`, `jenjang kepala`, `jenjang kepala unit`, `eselon kepala` | Tidak | Salah satu jenjang Struktural (§5) |
| `kepala_kebutuhan` | `kepala_kebutuhan` | `kepala kebutuhan`, `kebutuhan kepala`, `keb kepala` | Tidak | Bilangan bulat ≥ 0 |
| `kepala_eksisting` | `kepala_eksisting` | `kepala eksisting`, `eksisting kepala`, `eks kepala` | Tidak | Bilangan bulat ≥ 0 |
| `kode_tautan` | `kode_tautan` | `kode tautan` | Hanya baris Tautan | Kode OPD project tujuan, lihat §7 |
| `template` | `template` | (tidak ada alias lain) | Hanya baris root Template | Nomor unit itu sendiri, lihat §8 |

Kolom di luar daftar ini (`selisih`, `parent_nomor`, `parent_nama`,
`parent_id`) hanya informasional di file ekspor — **jangan diisi saat
menormalisasi data untuk diimpor**, diabaikan importer kalaupun ada.

**Atribut kustom**: kalau project tujuan sudah punya skema atribut kustom
(`Project.attributeSchema`), header yang namanya cocok persis dengan nama
atribut itu juga akan terbaca otomatis — tapi ini di luar cakupan normalisasi
umum, hanya relevan kalau diberi tahu skema atributnya secara eksplisit.

## 3. Format kolom `nomor` — WAJIB, menentukan struktur pohon

- Format: angka dipisah titik, contoh valid: `1`, `1.1`, `1.2.10`, `2.3.1.4`.
- Regex validasi per segmen: `^\d+$` — **tidak boleh** ada huruf, spasi, atau
  simbol lain di dalam segmen. `1a` atau `1.1a` **tidak valid**.
- **Hierarki ditentukan murni dari nomor**, bukan indentasi/urutan baris:
  baris bernomor `1.2` otomatis jadi anak dari baris bernomor `1`. Baris
  `1.2.10` adalah anak dari `1.2`, dan seterusnya. Baris root project harus
  bernomor `1` (segmen tunggal).
- Perbandingan nomor untuk urutan tampilan **numerik per segmen**, bukan
  leksikal — `1.10` tampil setelah `1.9`, bukan setelah `1.1`.
- **Setiap nomor harus unik** dalam satu file. Kalau ada nomor sama dengan
  nama berbeda pada baris berbeda, importer akan **menggabungkan** jadi satu
  node (memakai nama baris pertama) dan mencatat peringatan
  (`IMPORT_NOMOR_CONFLICT`) — jangan sengaja mengandalkan perilaku ini, tiap
  nomor harus dianggap satu node yang unik saat menormalisasi data.
- Kalau file mentah tidak punya nomor hirarkis sama sekali (mis. daftar datar
  per satuan kerja tanpa struktur), tugas normalisasi termasuk **menyusun
  nomor** berdasarkan struktur organisasi yang tersirat (nama unit induk,
  indentasi asli, dsb.) — nomor tidak boleh dikosongkan atau diberi placeholder
  sembarangan seperti `0` yang tidak mencerminkan hirarki sebenarnya.

## 4. Kolom `tipe` — tiga nilai valid

| Nilai kolom `tipe` (case-insensitive) | Alias yang juga diterima | Jadi apa |
|---|---|---|
| `Unit Organisasi` | `unit`, `u`, `organisasi` | Node Unit (boleh punya anak) |
| `Jabatan` | `jabatan`, `j`, `posisi` | Node Jabatan (posisi, punya angka kebutuhan/eksisting) |
| `Tautan` | `link` | Node Tautan ke project OPD lain, lihat §7 |

Kalau kolom `tipe` **dikosongkan**, importer menebak dari konteks baris:
1. Kalau baris punya `kategori`, `jenjang`, atau angka `kebutuhan`/`eksisting`
   apa pun yang bukan nol → dianggap **Jabatan**.
2. Kalau nama baris diawali kata `Sekretariat`, `Bidang`, `Sub Bidang`,
   `Sub Bagian`, `Bagian`, `Seksi`, `UPTD`, `UPT`, `Balai`, `Dinas`, `Badan`,
   `Satuan`, atau `Inspektorat` (case-insensitive) → dianggap **Unit**.
3. Selain itu → default **Jabatan**.

**Rekomendasi kuat untuk normalisasi data mentah: selalu isi kolom `tipe`
secara eksplisit.** Tebakan otomatis ini gampang salah untuk nama non-standar
(sekolah, klinik, nama entitas yang tidak diawali kata unit umum) — kasus
nyata yang pernah jadi bug: unit bernama `"SD (Template)"` tidak diawali kata
manapun di daftar itu, dan tanpa `tipe` eksplisit akan salah tergolong
Jabatan.

## 5. Kolom `kategori`, `rumpun`, `jenjang` — hanya untuk baris Jabatan

Berlaku HANYA pada baris `tipe = Jabatan`. Baris Unit tidak boleh diisi kolom
ini (kepala unit punya jalur sendiri, lihat §6).

**Kategori** (`kategori`, case-insensitive, harus salah satu):
- `Struktural` — TIDAK dipakai untuk baris Jabatan biasa (kepala unit
  struktural HARUS lewat kolom `kepala_*` di baris Unit, §6 — bukan baris
  Jabatan terpisah). File lama format sebelumnya kadang menulis struktural
  sebagai baris Jabatan; importer men-fold baris begitu ke `kepalaUnit`
  unitnya secara otomatis kalau persis satu per unit, tapi tetap **lebih
  aman menulis langsung ke kolom `kepala_*` saat menormalisasi data baru**.
- `Fungsional` — wajib isi `rumpun`.
- `Pelaksana` — `rumpun` dikosongkan.

**Rumpun** (`rumpun`, hanya untuk kategori Fungsional): `Keahlian`,
`Keterampilan`, atau keduanya dipisah koma/`dan`/`&`/`/` (mis. `"Keahlian dan
Keterampilan"`). Nilai lain tidak dikenali dan diabaikan diam-diam (jangan
tulis kombinasi lain).

**Jenjang** (`jenjang`) — daftar valid per kategori+rumpun (dari
`src/config/taxonomy.json`, cocok pada nama LENGKAP atau SINGKATAN,
case-insensitive):

| Kategori | Rumpun | Jenjang valid (nama · singkatan) |
|---|---|---|
| Struktural | — | JPT Pratama · JPT, Administrator · Adm, Pengawas · Pgw |
| Fungsional | Keahlian | Ahli Utama · AU, Ahli Madya · AMd, Ahli Muda · AMu, Ahli Pertama · AP |
| Fungsional | Keterampilan | Penyelia · Pny, Mahir · Mhr, Terampil · Trm, Pemula · Pml |
| Pelaksana | — | (tidak ada jenjang — kosongkan kolom ini) |

Jenjang yang tidak cocok dengan daftar ini akan **dikosongkan otomatis**
disertai peringatan (`IMPORT_BAD_JENJANG`), baris tidak gagal tapi datanya
hilang — pastikan ejaan persis salah satu di atas.

## 6. Kepala unit (posisi struktural) — kolom `kepala_*` di baris Unit

**Penting**: posisi kepala unit (JPT Pratama/Administrator/Pengawas) TIDAK
dibuat sebagai baris terpisah bertipe Jabatan. Posisi ini melekat langsung
pada baris Unit lewat 5 kolom:

- `kepala_nama` — nama posisi (opsional, default `"Kepala <nama unit>"`)
- `kepala_kode` — kode posisi (opsional)
- `kepala_jenjang` — salah satu dari 3 jenjang Struktural di §5
- `kepala_kebutuhan` — angka kebutuhan posisi ini (default 0 kalau kosong)
- `kepala_eksisting` — angka eksisting posisi ini (default 0 kalau kosong)

Kolom ini dianggap terisi (membuat kepala unit) kalau **salah satu** dari
kelima field itu tidak kosong. Kalau semua kosong, unit itu dianggap tidak
punya kepala (unit murni administratif tanpa jabatan struktural — valid).

**Baris Unit tidak boleh diisi kolom `kebutuhan`/`eksisting` biasa** (yang itu
khusus baris Jabatan) — kalau terisi, angkanya **diabaikan** disertai
peringatan (`IMPORT_UNIT_HAS_FIGURES`); total kebutuhan/eksisting unit selalu
dihitung otomatis dari kepala unit + total jabatan-jabatan di bawahnya, tidak
pernah ditulis manual.

## 7. Baris Tautan (link ke project OPD lain)

Untuk kasus struktur mengacu ke project OPD lain yang sudah/akan ada di
aplikasi (mis. Dinas Kesehatan punya baris yang menunjuk ke project
"Puskesmas Kota Timur" yang berdiri sendiri):

- `tipe` = `Tautan`
- `kode_tautan` = kode OPD project tujuan (**wajib** — tanpa ini baris
  dianggap gagal jadi tautan dan diperlakukan sebagai unit kosong biasa,
  disertai error `IMPORT_LINK_NO_KODE`)
- `nama` = nama tampilan tautan itu (biasanya sama dengan nama project
  tujuan)
- Kolom `kebutuhan`/`eksisting` di baris ini BOLEH diisi — ini beda dari
  baris Unit biasa — dipakai sebagai **cache** angka pada saat impor (angka
  sebenarnya nanti diresolusi ulang dari project tujuan secara live oleh
  aplikasi kalau file project itu juga tersimpan di sana).
- Baris Tautan **tidak boleh** punya anak (nomor lain yang menjadikan baris
  ini sebagai induk) dan tidak boleh diisi `kepala_*`.
- Baris Tautan tidak butuh kolom `kategori`/`rumpun`/`jenjang`.

## 8. Baris Template (struktur berulang, mis. banyak sekolah/instansi sejenis)

Untuk kasus satu struktur dipakai berulang oleh banyak "instance" yang punya
angka kebutuhan/eksisting sendiri-sendiri (skenario asal fitur ini: banyak
sekolah berbagi struktur guru/tata usaha yang sama, tapi tiap sekolah beda
jumlah):

- Baris **root** template: `tipe = Unit Organisasi`, kolom `template` diisi
  **nomor baris itu sendiri** (sama persis dengan kolom `nomor`-nya). Ini
  penanda "unit ini adalah template".
- Semua baris Unit/Jabatan **di bawah** root template (anak, cucu, dst.
  menurut nomor) **wajib** punya `kebutuhan` / `eksisting` / `kepala_kebutuhan`
  / `kepala_eksisting` = **0**. Ini invariant keras — angka sesungguhnya per
  instance TIDAK ditulis di sheet Struktur sama sekali, melainkan di sheet
  terpisah `Satuan_<nomor>` (lihat di bawah).
- **Sheet tambahan wajib**: satu sheet bernama persis `Satuan_<nomor>`
  (contoh: root template bernomor `1.4` → sheet bernama `Satuan_1.4`),
  berisi data per-instance dalam bentuk matrix:

  ```
  baris 1 (disembunyikan): '', '', <rincianId atau node-id-unit kepala>, <sama>, ...
  baris 2:                 satuan, kode, <Nama Posisi/Kepala Unit>  (merge 2 kolom per posisi)
  baris 3:                 '', '', K atau <jenjang>·K, E atau <jenjang>·E, ...
  baris 4+:                <nama instance>, <kode>, <kebutuhan>, <eksisting>, ...
  ```

  - Satu **grup kolom** (2 kolom: K dan E) per posisi jabatan di subtree
    template — kalau jabatan itu punya lebih dari satu jenjang (rincian),
    tiap jenjang dapat pasangan kolom sendiri, sub-header jadi
    `<NamaJenjang>·K` / `<NamaJenjang>·E`.
  - Kepala unit (termasuk kepala sub-unit di dalam template) juga dapat satu
    grup kolom (2 kolom, K/E), label grup `Kepala <nama unit>`.
  - Baris ke-4 dst = satu baris per instance (mis. satu baris per sekolah):
    kolom 1 = nama instance, kolom 2 = kode instance (opsional), lalu
    pasangan K/E untuk tiap grup kolom sesuai urutan yang sama dengan header.
  - **Baris 1 (hidden id) bersifat opsional tapi sangat disarankan** — kalau
    ada dan cocok dengan struktur di sheet Struktur, importer memetakan kolom
    dengan presisi mutlak. Kalau tidak ada (file ditulis manual tanpa baris
    tersembunyi), importer mencocokkan berdasarkan **nama grup di baris 2 +
    teks level di baris 3 (tanpa akhiran `·K`/`·E`)** — cocokkan persis nama
    posisi/kepala unit dan nama jenjang di struktur, case-insensitive.
  - Kalau nomor template di nama sheet tidak ditemukan di sheet Struktur,
    HANYA sheet itu yang gagal diimpor (sheet Struktur dan sheet Satuan
    lainnya tetap diproses normal).
  - Boleh ada lebih dari satu template dalam satu file — masing-masing dapat
    sheet `Satuan_<nomor>`-nya sendiri.

## 9. Aturan angka (kebutuhan, eksisting, dan kolom serupa)

- Harus bilangan bulat ≥ 0.
- Pemisah ribuan gaya Indonesia (`1.234`) dan koma desimal (`1,5`) diterima
  dan dikonversi otomatis — tapi **paling aman tulis angka polos tanpa
  pemisah** (`1234`) saat menormalisasi data baru, supaya tidak ambigu dengan
  titik yang juga dipakai di kolom `nomor`.
- Sel kosong atau `-` dianggap `0`.
- Angka negatif dianggap `0` disertai peringatan — jangan pernah menulis
  angka negatif.
- Angka desimal (mis. `2.5` dengan makna desimal, bukan ribuan) dibulatkan
  disertai peringatan — hindari, gunakan bilangan bulat murni.

## 10. Contoh baris minimal yang valid (illustrasi, bukan data nyata)

| nomor | nama | tipe | kategori | rumpun | jenjang | kebutuhan | eksisting | kode | kepala_nama | kepala_kode | kepala_jenjang | kepala_kebutuhan | kepala_eksisting | kode_tautan | template |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Dinas Contoh | Unit Organisasi | | | | | | DIS.01 | Kepala Dinas Contoh | KADIS.01 | JPT Pratama | 1 | 1 | | |
| 1.1 | Sekretariat | Unit Organisasi | | | | | | | Sekretaris | SEK.01 | Administrator | 1 | 1 | | |
| 1.2 | Bidang Contoh | Unit Organisasi | | | | | | | | KAB.01 | Pengawas | 1 | 1 | | |
| 1.2.1 | Analis Kebijakan | Jabatan | Fungsional | Keahlian | Ahli Muda | 2 | 1 | | | | | | | | |
| 1.2.2 | Pengadministrasi Umum | Jabatan | Pelaksana | | | 1 | 0 | | | | | | | | |
| 1.3 | Puskesmas Kota Timur | Tautan | | | | | | | | | | | | PKM-KTIM | |
| 1.4 | SD Contoh (Template) | Unit Organisasi | | | | | | | | | | 0 | 0 | | 1.4 |
| 1.4.1 | Guru Kelas | Jabatan | Fungsional | Keahlian | Ahli Pertama | 0 | 0 | | | | | | | | |

Baris `1.4` dan `1.4.1` di atas adalah root template dan satu jabatan di
subtree-nya — angka sesungguhnya per sekolah ada di sheet `Satuan_1.4`
terpisah (§8), bukan di baris ini.

File template kosong yang sudah memuat semua contoh di atas bisa diunduh
langsung dari aplikasi: **Kelola Proyek → Impor Berkas → Unduh Template**.

## 11. Checklist normalisasi cepat (untuk LLM yang mengerjakan konversi)

1. Identifikasi kolom apa saja yang tersedia di data mentah, petakan ke tabel
   §2. Kolom yang tidak ada di data mentah tapi wajib (§2) harus diturunkan
   dari data lain atau ditandai untuk ditanyakan ke pengguna — jangan
   dikarang.
2. Bangun nomor hirarkis (§3) yang konsisten dari struktur asli (indentasi,
   nama unit induk yang disebut, dsb.).
3. Tentukan `tipe` eksplisit untuk SETIAP baris (§4) — jangan andalkan
   tebakan otomatis.
4. Untuk baris Jabatan: isi `kategori`+`rumpun`+`jenjang` memakai istilah
   PERSIS dari daftar §5 (nama lengkap atau singkatan resmi).
5. Untuk posisi kepala unit: pindahkan ke kolom `kepala_*` di baris Unit
   induknya (§6) — JANGAN buat sebagai baris Jabatan terpisah berkategori
   Struktural.
6. Kalau data mentah mengandung referensi ke entitas/OPD lain yang berdiri
   sendiri: pertimbangkan baris Tautan (§7).
7. Kalau data mentah adalah data berulang per-instance dengan struktur sama
   (banyak sekolah/cabang/UPT sejenis): pertimbangkan pola Template + sheet
   `Satuan_<nomor>` (§8) alih-alih menuliskan ratusan baris duplikat di sheet
   Struktur.
8. Validasi semua angka sesuai §9 sebelum menulis file akhir.
9. Kalau ragu antara beberapa opsi (nama kategori tidak jelas Fungsional atau
   Pelaksana, dsb.), laporkan ambiguitas itu ke pengguna alih-alih menebak
   sepihak — importer aplikasi akan mencatat peringatan untuk baris yang
   datanya tidak jelas, tapi keputusan semantik sebaiknya diambil manusia.
