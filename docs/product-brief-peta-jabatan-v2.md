> [!CAUTION]
> ## ⚠️ DOKUMEN INI SUDAH TIDAK BERLAKU (ARSIP)
>
> **Dokumen ini adalah produk brief versi 2.0 yang telah digantikan oleh
> [`00-product-brief.md`](./00-product-brief.md) (versi 4.x — dokumen resmi aktif).**
>
> Jangan gunakan dokumen ini sebagai referensi implementasi. Beberapa ketentuan
> di sini **bertentangan** dengan spesifikasi final yang berlaku:
>
> | Aspek | Di dokumen ini (SALAH) | Di `00-product-brief.md` (BENAR) |
> |---|---|---|
> | Storage backend | `LocalStorage` | `IndexedDB` (idb-keyval) |
> | Edge field name | `Edge.tipe` | `OrgEdge.kind` |
> | Node type field | `Node.tipe` | `OrgNode.type` |
> | Quota | ~5 MB | 50 MB (IndexedDB) |
> | Stage B features | Tidak ada | Link nodes, dashboard, template-instance (docs 13–15) |
> | Directory structure | `features/` dir | Flat: `import/`, `export/`, `selectors/`, dll. |
>
> Dokumen ini dipertahankan sebagai catatan historis evolusi desain.
> **Untuk implementasi, baca: [00-product-brief.md](./00-product-brief.md)**

---

# Product Brief — Revisi 2 (ARSIP)
## Peta Jabatan Builder
### Alat penyusun struktur organisasi dan kebutuhan jabatan untuk OPD

**Versi dokumen:** 2.0
**Perubahan utama dari v1:** taksonomi jabatan dipindahkan dari tipe node ke atribut berbasis konfigurasi; angka kebutuhan disimpan sebagai rincian baris (mendukung jenjang JF); import template XLSX dinaikkan menjadi jalur masuk utama; sasaran pengguna diperluas ke operator OPD; scope MVP dirapikan agar konsisten antar bagian.

---

# 1. Ringkasan Produk

Aplikasi web frontend-only untuk menyusun peta jabatan satu OPD secara visual, mengelola angka kebutuhan dan eksisting per jabatan, serta menghasilkan rekapitulasi dan file pertukaran data.

Tiga hal yang membentuk produk ini:

1. **Kanvas bebas** — setiap node dapat digeser sesuai selera penyusun, bukan tata letak yang dipaksakan mesin.
2. **Angka melekat pada struktur** — kebutuhan dan eksisting menjadi bagian dari node, sehingga rekapitulasi selalu sinkron dengan diagram.
3. **Template sebagai jalan masuk** — struktur dapat dibentuk dari file Excel yang sudah dimiliki OPD, tidak harus diketik ulang di kanvas.

Aplikasi ini **bukan** sistem informasi kepegawaian, **bukan** alat analisis jabatan (tidak ada uraian tugas, volume kerja, atau perhitungan beban kerja), dan **bukan** editor diagram serbaguna.

---

# 2. Problem Statement

Penyusunan peta jabatan umumnya dikerjakan dengan PowerPoint atau Visio untuk diagramnya, dan Excel terpisah untuk angkanya.

Akibatnya:

- diagram dan angka berada di dua tempat dan cepat tidak sinkron
- rekapitulasi kebutuhan per unit dikerjakan manual dan rawan salah hitung
- mengubah struktur besar berarti menggeser puluhan kotak satu per satu
- hasil akhir tidak dapat dipakai lagi sebagai data
- konsolidasi lintas OPD berarti menyatukan puluhan file dengan format yang berbeda-beda

Yang dibutuhkan: satu alat sederhana di mana diagram dan angka berasal dari sumber yang sama, dapat diisi oleh operator tanpa pelatihan panjang, dan menghasilkan file yang dapat dijumlahkan.

---

# 3. Tujuan Produk

- Menyusun struktur organisasi satu OPD dengan cepat, dari nol maupun dari template
- Mencatat kebutuhan dan eksisting per jabatan, termasuk per jenjang untuk jabatan fungsional
- Menampilkan rekapitulasi yang selalu mengikuti struktur terkini
- Menghasilkan file yang dapat disimpan, dikirim, dan dikonsolidasikan

---

# 4. Target Pengguna

**Pengguna primer — Operator OPD.** Staf yang ditugasi menyusun peta jabatan OPD-nya. Tidak dilatih khusus, tidak selalu paham istilah teknis, bekerja sendiri tanpa pendampingan. Pengalaman merekalah yang menentukan keberhasilan produk ini.

**Pengguna sekunder — Bagian Organisasi / BKPSDM.** Menyiapkan template dan konfigurasi, menerima file dari OPD, mengonsolidasikan, dan mengoreksi.

Implikasi utama dari adanya banyak operator: **taksonomi dan struktur data harus terpusat.** Operator mengisi data, tidak mendefinisikan format. Ini dibahas di bagian 7 dan 19.

---

# 5. Scope

## In Scope — MVP

| Kelompok | Fitur |
|---|---|
| Kanvas | Posisi node bebas, snap-to-grid, multi-select drag, zoom, pan, fit screen, collapse/expand |
| Node | Tambah, edit, hapus, duplikat, duplikat subtree |
| Hirarki | Parent diatur melalui dropdown di panel properti |
| Tata letak | Auto Layout (Dagre) untuk seluruh kanvas atau subtree terpilih, dapat di-undo |
| Data | Rincian kebutuhan/eksisting per baris, custom attribute level project |
| Rekap | Panel rekapitulasi live: total OPD, per unit, per kategori jabatan |
| History | Undo/redo 50 langkah |
| Simpan | Autosave LocalStorage, multi-project, indikator waktu simpan |
| Import | JSON, XLSX (template) dengan preview sebelum commit |
| Export | JSON, XLSX, CSV, PNG |
| Validasi | Non-blocking + tombol **Cek Kesiapan** sebelum export |

## Out of Scope — MVP

Ditunda ke versi berikutnya: search, filter, relasi koordinasi/pembinaan, export PDF, drag reparenting di tree, template struktur OPD siap pakai, rekap lintas-project, align/distribute.

Tidak akan dibuat: backend, database, login, multi-user, kolaborasi real-time, workflow persetujuan, hak akses, uraian tugas dan perhitungan ABK.

**Catatan konsolidasi:** pengumpulan file dari OPD dilakukan melalui kanal yang sudah ada (email, Drive bersama). Membangun backend hanya untuk pengumpulan file akan menggandakan cakupan proyek tanpa menyelesaikan masalah yang lebih besar.

---

# 6. Keputusan Arsitektur Kunci

Empat keputusan yang menjadi dasar seluruh rancangan dan sebaiknya tidak diubah tanpa meninjau ulang dokumen ini:

**1. Satu file = satu OPD.** Bukan satu kanvas untuk seluruh pemda. Sesuai pola kerja terdelegasi, menjaga performa, dan membatasi dampak kerusakan file. Kebutuhan rekap se-pemda diselesaikan lewat panel rekap lintas-project di V1 — membaca semua project tanpa membuka kanvas.

**2. Tipe node hanya dua; klasifikasi adalah atribut.** Tipe node menentukan perilaku aplikasi, bukan klasifikasi data. Lihat bagian 7.

**3. Posisi dan hirarki adalah dua sumber data terpisah.** Posisi tersimpan di node, hirarki tersimpan di edge. Tidak ada kode yang boleh menyimpulkan hirarki dari koordinat. Drag di kanvas **tidak pernah** mengubah parent.

**4. JSON untuk simpan-buka, XLSX untuk masuk-keluar data.** JSON menyimpan posisi node dan custom attribute — ini format kerja. XLSX adalah format pertukaran dan penyuntingan massal. Peran keduanya tidak boleh tertukar.

---

# 7. Model Data

## 7.1 Tipe Node

Hanya dua, dibedakan karena **perilakunya** berbeda:

| Tipe | Angka | Keterangan |
|---|---|---|
| **Unit Organisasi** | Read-only, agregat seluruh keturunan | Sekretariat, Bidang, Sub Bidang |
| **Jabatan** | Diinput | Kepala Dinas, Kepala Bidang, Analis Kebijakan, Pengelola Data |

Node Unit **tidak boleh** memiliki angka yang diinput manual. Jika unit bisa diisi manual sekaligus menampilkan agregat, rekapitulasi akan menghitung ganda — dan angkanya tetap terlihat wajar sehingga sulit dilacak. Secara visual, node Unit dibedakan gayanya agar tidak terlihat seperti kolom yang bisa diisi.

## 7.2 Klasifikasi Jabatan

Struktural, Fungsional, dan Pelaksana **bukan tipe node** — perilakunya identik (sama-sama diinput, dijumlahkan, dan bisa punya anak). Menjadikannya tipe node berarti setiap penambahan kategori menuntut perubahan kode, padahal taksonomi harus dapat diatur lewat konfigurasi.

Klasifikasi diwujudkan sebagai atribut dua tingkat yang isinya dibaca dari file konfigurasi:

```
kategori  →  Struktural | Fungsional | Pelaksana
rumpun    →  Keahlian | Keterampilan   (khusus Fungsional, boleh keduanya)
jenjang   →  dropdown dependen, mengikuti kategori dan rumpun
```

| Kategori | Rumpun | Pilihan jenjang |
|---|---|---|
| Struktural | — | JPT Pratama, Administrator, Pengawas |
| Fungsional | Keahlian | Ahli Utama, Ahli Madya, Ahli Muda, Ahli Pertama |
| Fungsional | Keterampilan | Penyelia, Mahir, Terampil, Pemula |
| Pelaksana | — | (kosong, atau sesuai konfigurasi) |

Field **Eselon** dari v1 dihapus. Field **Jenjang** tidak lagi berdiri sendiri — ia sudah menjadi tingkat kedua taksonomi ini, dan menampung istilah lama maupun jenjang JF di tempat yang sama.

Pembedaan visual antara jabatan struktural dan non-struktural di kanvas dilakukan melalui warna kartu yang dipetakan dari `kategori` di konfigurasi — tanpa menambah tipe node.

> **Perlu diverifikasi sebelum konfigurasi difinalkan:** daftar jenjang di atas, khususnya keberadaan jenjang Pemula, mengacu pada peraturan yang dapat berubah. Konfirmasikan ke Permenpan yang berlaku saat implementasi.

## 7.3 Rincian Angka (mendukung jenjang JF)

Membuat satu node per jenjang tidak praktis: satu Analis Kepegawaian bisa menjadi empat kotak bernama sama di bawah atasan yang sama. Karena itu angka tidak menempel langsung pada node, melainkan pada **baris rincian** di dalamnya.

Berlaku seragam untuk semua jabatan, sehingga tidak ada dua jalur logika:

- Jabatan struktural / pelaksana → tepat **satu** baris rincian, tanpa label jenjang
- Jabatan fungsional → **satu atau lebih** baris, masing-masing berlabel jenjang
- Node Unit → **nol** baris; angkanya dihitung

Angka pada kartu node adalah jumlah seluruh barisnya. Agregasi unit tetap satu rumus: jumlahkan semua baris pada seluruh keturunan.

**Baris jenjang tidak di-prefill.** Operator hanya menambahkan baris untuk jenjang yang benar-benar ada di OPD-nya. Jika keempat jenjang otomatis muncul dengan nilai nol, hasilnya ratusan baris kosong yang mengotori rekap dan export.

**Selisih = Eksisting − Kebutuhan.** Nilai negatif berarti kurang, positif berarti kelebihan. Nilai ini **dihitung saat render, tidak disimpan** — nilai turunan yang disimpan pasti akan tidak sinkron pada suatu titik. Eksisting melebihi kebutuhan adalah kondisi nyata dan bukan error.

## 7.4 Skema Data

```
Project {
  schemaVersion: string          // wajib sejak MVP
  configVersion: string          // versi taksonomi yang dipakai
  meta: {
    namaOPD, kodeOPD, penyusun,
    tanggalDibuat, tanggalDiubah, keterangan
  }
  attributeSchema: [ { id, nama, tipe, opsi?, wajib? } ]
  nodes: [ Node ]
  edges: [ Edge ]
  viewport: { x, y, zoom }
}

Node {
  id            // UUID, tersembunyi dari pengguna
  tipe          // 'unit' | 'jabatan'
  nama          // wajib
  nomor         // nomor hirarkis, editable, dipakai saat export
  kode?         // kode jabatan
  kategori?     // jabatan saja
  rumpun?       // ['keahlian'] | ['keterampilan'] | keduanya
  rincian: [ { id, jenjang, kebutuhan, eksisting } ]
  unitKerja?
  keterangan?
  custom: { [attrId]: value }
  position: { x, y }     // wajib disimpan
  collapsed: boolean
}

Edge {
  id, source, target
  tipe          // 'hirarki' (MVP); 'koordinasi' | 'pembinaan' di V1
}
```

## 7.5 Custom Attribute

Skema didefinisikan **di level project**, berlaku untuk semua node. Tipe yang didukung: Text, Number, Dropdown, Boolean, Date, Multiline Text.

Karena aplikasi digunakan banyak operator, custom attribute **tidak boleh didefinisikan bebas per OPD** — hasilnya tidak akan bisa dijumlahkan, dan itu baru disadari setelah puluhan file masuk. Bagian Organisasi mendistribusikan **template project** yang sudah memuat skema; operator mengisi, tidak mendefinisikan.

---

# 8. Konfigurasi Terpusat

Taksonomi disimpan dalam file konfigurasi yang dibundel bersama aplikasi (dibaca, tidak diedit operator):

```
config/taksonomi.json
├── kategori[]           nama, warna kartu, apakah punya rumpun
├── jenjang[]            per kategori dan rumpun, beserta singkatan
└── configVersion
```

Konfigurasi ini juga menjadi sumber dropdown pada template XLSX (bagian 12), sehingga satu perubahan berlaku di dua tempat.

---

# 9. Interaksi Kanvas

**Drag node** hanya mengubah posisi. Tidak pernah menyentuh hirarki.

**Mengubah parent** dilakukan melalui dropdown Parent di panel properti (MVP). Drag di sidebar tree menyusul di V1.

**Bantuan penataan (MVP):** snap-to-grid dan multi-select drag. Alignment guide serta align/distribute di V1.

**Auto Layout ("Rapikan")** berlaku untuk seluruh kanvas atau subtree terpilih, masuk history dan dapat di-undo satu langkah. Konfirmasi ditampilkan sekali pada penggunaan pertama untuk seluruh kanvas. Dagre bukan lagi mesin tata letak — ia tombol atas permintaan pengguna.

**Isi kartu node:**

- Jabatan biasa: nama + `kebutuhan / eksisting / selisih` dengan penanda warna
- Jabatan fungsional: nama + total, dengan rincian jenjang ringkas di bawahnya, mis. `Md 2/1 · Mu 3/3 · Pt 4/2`
- Unit: nama + agregat, gaya visual berbeda

Rincian jenjang dapat disembunyikan lewat toggle global bila kanvas terasa padat.

**Keyboard shortcut (MVP):** Tab tambah anak, Enter tambah sibling, Delete hapus, Ctrl+Z / Ctrl+Shift+Z, Ctrl+S export. Ini yang membuat editor struktur terasa cepat dan biayanya kecil.

---

# 10. Validasi

Seluruh validasi bersifat **non-blocking** — ditampilkan sebagai peringatan, tidak memblokir pekerjaan. Operator sering membuat banyak jabatan lebih dulu dan memasang parent kemudian; validasi yang memaksa akan menghalangi cara kerja nyata.

Yang diperiksa:

- Nama jabatan terisi
- Angka bukan negatif
- Tidak ada cycle *(dicegah di tingkat interaksi, bukan divalidasi belakangan)*
- Satu root wajib ada
- Node tanpa parent diizinkan, ditandai, dan ditampung di panel **Belum Ditempatkan**
- Kode jabatan duplikat (peringatan saja)
- Menghapus node yang masih memiliki anak memerlukan konfirmasi

## Cek Kesiapan

Tombol khusus sebelum export, penting karena operator tidak dilatih intensif. Menampilkan temuan konkret dengan lokasinya:

- berapa node belum punya parent, dan node mana
- jabatan mana yang seluruh angkanya masih nol
- jabatan mana yang kategorinya belum diisi
- jabatan fungsional mana yang belum punya baris rincian

Validasi tetap tidak memblokir, tetapi tidak boleh senyap.

---

# 11. Penyimpanan

**Autosave ke LocalStorage** dengan indikator "terakhir disimpan" yang selalu terlihat.

**Multi-project sejak MVP** — daftar project, duplikat, ganti nama. Satu operator bisa memegang lebih dari satu unit, dan Bagian Organisasi akan membuka banyak file.

**Export JSON adalah mekanisme serah-terima utama, bukan sekadar backup.** LocalStorage terikat pada satu browser di satu komputer; ganti PC berarti pekerjaan tidak ikut. Ini harus dinyatakan eksplisit di UI, dan tombol export ditempatkan sebagai akhir alur kerja — *"Selesai → Unduh file untuk dikirim"* — bukan disembunyikan di menu.

**Konvensi nama file otomatis:** `peta-jabatan_[kodeOPD]_[YYYY-MM-DD].json`. Tanpa ini, akan diterima tiga puluh file bernama `peta-jabatan.json`.

`schemaVersion` dan `configVersion` wajib ada di setiap file sejak MVP. Biayanya satu baris sekarang, mahal nanti.

---

# 12. Import Template XLSX

Hampir setiap OPD sudah memiliki daftar jabatannya di Excel. Meminta operator mengetik ulang delapan puluh jabatan di kanvas adalah cara tercepat membuat alat ini ditinggalkan. Karena itu **template adalah jalur masuk utama**, bukan fitur tambahan.

Alur: **isi template → import → preview → struktur terbentuk + Auto Layout → operator merapikan dan menyempurnakan di kanvas.**

Kanvas tetap didukung penuh untuk yang ingin mulai dari nol — template hanya salah satu jalan masuk.

## 12.1 Hirarki melalui Nomor Hirarkis

Parent diturunkan otomatis dari nomor: `1.1.1` adalah anak dari `1.1`.

```
1        Kepala Dinas
1.1      Sekretariat
1.1.1    Kepala Sub Bagian Umum
1.1.2    Analis Kepegawaian
1.2      Bidang Pendidikan Dasar
```

Dipilih di atas kolom parent ID karena operator tidak perlu mengelola ID, tidak ada typo yang memutus relasi, urutan baris langsung terbaca sebagai struktur, dan formatnya sudah familiar. Kolom parent ID tampak lebih benar secara teknis tetapi jauh lebih rapuh di tangan puluhan operator.

Nomor **disimpan sebagai atribut node** yang dapat diedit dan dipakai kembali saat export.

## 12.2 Jenjang JF di Template

Beberapa baris dengan **nomor yang sama** digabung menjadi satu node dengan beberapa rincian jenjang:

```
nomor    nama                 kategori     jenjang        kebutuhan  eksisting
1.1.2    Analis Kepegawaian   Fungsional   Ahli Muda      3          2
1.1.2    Analis Kepegawaian   Fungsional   Ahli Pertama   4          3
```

## 12.3 Format Template

**XLSX, bukan CSV** — karena XLSX mendukung data validation. Dropdown untuk kategori, rumpun, dan jenjang adalah cara menegakkan taksonomi terpusat tanpa backend, dan jauh lebih efektif daripada mengandalkan operator membaca petunjuk.

| Sheet | Isi |
|---|---|
| **Struktur** | Data, dengan dropdown pada kolom klasifikasi |
| **Referensi** | Taksonomi dari konfigurasi; sumber dropdown |
| **Petunjuk** | Cara pengisian dan contoh |

Kolom sheet Struktur: `nomor`, `nama`, `tipe`, `kategori`, `rumpun`, `jenjang`, `kebutuhan`, `eksisting`, `kode`, `unit_kerja`, `keterangan`, ditambah satu kolom per custom attribute.

## 12.4 Preview Wajib

Import **tidak boleh** langsung commit. Preview menampilkan:

- ringkasan: jumlah node, jumlah baris rincian, total kebutuhan dan eksisting
- daftar temuan **beserta nomor barisnya**: nomor melompat, parent tidak ditemukan, kategori tidak dikenal, jenjang tidak sesuai kategori, angka bukan numerik, nomor duplikat dengan nama berbeda

Operator memperbaiki di Excel lalu import ulang. Tanpa preview, fitur ini akan lebih banyak menimbulkan frustrasi daripada menolong.

**Import selalu membuat project baru.** Merge/update berdasarkan nomor ditunda ke V1.

---

# 13. Export

| Format | Kegunaan | MVP |
|---|---|---|
| JSON | Simpan, kirim, buka kembali — memuat posisi dan custom attribute | ✔ |
| XLSX | Pertukaran data dan penyuntingan massal | ✔ |
| CSV | Analisis cepat | ✔ |
| PNG | Ditempel ke paparan atau laporan | ✔ |
| PDF | — | V1 |

**Spesifikasi kolom XLSX/CSV export identik dengan template import.** Ini memungkinkan siklus **export → sunting massal di Excel → import ulang**, yang sangat berguna untuk revisi besar yang menyiksa bila dilakukan satu per satu di kanvas.

**Granularitas satu baris = satu rincian**, bukan satu node. Jabatan fungsional menghasilkan beberapa baris dengan `nomor` dan `parent` yang berulang. Bentuk ini justru lebih berguna untuk analisis.

Kolom export menambahkan `parent_id` dan `parent_nama` di samping `nomor`, serta `selisih` sebagai kolom terhitung. Saat import, `parent_id` diabaikan — hirarki selalu diturunkan dari `nomor`.

**PNG:** seluruh diagram (fit), dengan pilihan latar putih atau transparan.

---

# 14. Panel Rekapitulasi

Tampil live di sidebar, mengikuti struktur terkini. Inilah yang membedakan alat ini dari Visio, dan biayanya jauh lebih kecil daripada search atau import Excel.

- Total OPD: kebutuhan, eksisting, selisih
- Breakdown per unit organisasi
- Breakdown per kategori jabatan
- Untuk jabatan fungsional: breakdown per jenjang

Seluruh angka dihitung dari baris rincian, bukan dari nilai yang disimpan di node.

---

# 15. Antarmuka

```
┌──────────────────────────────────────────────────┐
│  Toolbar                                         │
├──────────┬─────────────────────────┬─────────────┤
│ Sidebar  │                         │  Panel      │
│ kiri     │        Kanvas           │  Properti   │
│          │                         │             │
│ · Tree   │                         │  · Atribut  │
│ · Belum  │                         │  · Rincian  │
│   Ditem- │                         │    angka    │
│   patkan │                         │  · Custom   │
│ · Rekap  │                         │             │
├──────────┴─────────────────────────┴─────────────┤
│  Status bar: simpan terakhir · jumlah node · versi│
└──────────────────────────────────────────────────┘
```

**Toolbar:** Project, Tambah Node, Rapikan, Undo, Redo, Cek Kesiapan, Import, Export.

Bahasa Indonesia, tema terang. Nomor versi aplikasi ditampilkan di status bar — operator akan menjalankan versi cache lama, dan itu perlu bisa didiagnosis.

Aplikasi sebaiknya berjalan offline (PWA atau satu folder statis), karena koneksi di lingkungan OPD tidak selalu tersedia.

---

# 16. Alur Pengguna

**Jalur A — dari template (utama)**

```
Unduh template  →  Isi di Excel  →  Import  →  Preview & perbaiki
   →  Rapikan posisi di kanvas  →  Lengkapi atribut
   →  Cek Kesiapan  →  Export JSON + XLSX  →  Kirim
```

**Jalur B — dari kanvas**

```
Project baru  →  Tambah root  →  Tambah unit & jabatan
   →  Isi angka  →  Atur parent  →  Rapikan
   →  Cek Kesiapan  →  Export  →  Kirim
```

---

# 17. Teknologi

| Lapisan | Pilihan |
|---|---|
| Frontend | React + TypeScript |
| Diagram | React Flow |
| Auto Layout | Dagre |
| Styling | Tailwind CSS |
| State | Zustand |
| Validasi skema | Zod |
| Spreadsheet | SheetJS (xlsx) — dependensi MVP |
| Export gambar | html-to-image |
| Simpan | LocalStorage |

Dagre hanya dipanggil saat pengguna menekan Rapikan, dan **relasi non-hirarki (V1) harus dikeluarkan dari perhitungannya**, juga dari cycle-check, sidebar tree, dan kolom parent pada export.

---

# 18. Struktur Project

```
src/
├── components/     Toolbar, Sidebar, TreeView, Canvas, NodeCard,
│                   PropertyPanel, RincianTable, RekapPanel, ImportPreview
├── features/       editor, import, export, layout, history, rekap, validasi
├── store/          project, history, ui
├── schema/         definisi Zod, migrasi schemaVersion
├── models/         Node, Edge, Rincian, Attribute
├── config/         taksonomi.json
├── utils/
├── hooks/
└── styles/
```

---

# 19. Konsekuensi Penggunaan oleh Banyak Operator

Ringkasan hal-hal yang mengikat karena pengguna primer adalah operator OPD yang bekerja mandiri:

1. **Taksonomi dan skema atribut terpusat.** Dibundel bersama aplikasi dan didistribusikan lewat template project. Operator mengisi, tidak mendefinisikan.
2. **Template XLSX dengan dropdown** sebagai penegak format di titik input.
3. **Metadata project wajib** (nama dan kode OPD, penyusun, tanggal, versi) agar file dapat dikonsolidasikan.
4. **Konvensi nama file otomatis.**
5. **Cek Kesiapan sebelum export** karena tidak ada pendampingan.
6. **Export ditempatkan sebagai akhir alur kerja**, dengan penjelasan bahwa LocalStorage tidak berpindah komputer.
7. **Berjalan offline** dan menampilkan nomor versi aplikasi.

---

# 20. Roadmap

**MVP** — sesuai bagian 5.

**V1**
- Search (nama, kode, unit kerja) dengan highlight dan auto zoom
- Filter berdasarkan kategori, jenjang, dan unit
- Relasi koordinasi dan pembinaan (garis dashed)
- Export PDF
- Drag reparenting di sidebar tree
- Alignment guide, align dan distribute
- Template struktur OPD siap pakai
- Rekap lintas-project (agregasi se-pemda dari LocalStorage)
- Import merge/update berdasarkan nomor

**V2**
- Perbandingan dua versi peta jabatan
- Statistik dan visualisasi kebutuhan
- Beberapa diagram dalam satu project
- File System Access API untuk simpan langsung ke file

---

# 21. Non-Fungsional

- Lancar hingga **500 node**; gunakan `onlyRenderVisibleElements` dan memoization pada node
- Undo/redo **50 langkah**
- Bahasa Indonesia, tema terang
- Berjalan offline, tanpa panggilan jaringan
- Berfungsi pada Chrome dan Edge versi terkini

---

# 22. Nilai Pembeda

1. Diagram dan angka berasal dari satu sumber, sehingga rekapitulasi tidak pernah tertinggal dari struktur.
2. Rincian per jenjang jabatan fungsional ditangani tanpa memaksa satu node per jenjang.
3. Struktur dapat dibentuk dari file Excel yang sudah dimiliki OPD, bukan diketik ulang.
4. Siklus export–sunting–import memungkinkan revisi besar dikerjakan di Excel.
5. Posisi node sepenuhnya bebas, tetapi tetap ada tombol Rapikan.
6. Tanpa server dan tanpa database; file berpindah sebagai JSON dan XLSX.
7. Dirancang khusus untuk peta jabatan OPD, bukan editor diagram serbaguna.

---

# 23. Definition of Done

MVP dinyatakan selesai apabila seorang operator OPD, tanpa pendampingan, dapat:

- [ ] membuat project baru dan menyusun struktur dari nol di kanvas
- [ ] mengunduh template XLSX, mengisinya, dan mengimpornya sehingga struktur terbentuk otomatis
- [ ] melihat preview import berisi ringkasan dan daftar temuan beserta nomor baris
- [ ] menggeser setiap node secara bebas, dengan snap-to-grid dan multi-select
- [ ] menekan Rapikan untuk seluruh kanvas maupun subtree, dan membatalkannya dengan satu undo
- [ ] mengubah parent melalui dropdown tanpa memengaruhi posisi node lain
- [ ] mengisi kebutuhan dan eksisting, termasuk beberapa baris jenjang pada satu jabatan fungsional
- [ ] melihat rekapitulasi total, per unit, dan per kategori yang berubah seketika saat data diedit
- [ ] menambahkan custom attribute di level project dan mengisinya pada node
- [ ] melakukan undo/redo hingga 50 langkah
- [ ] menutup browser dan menemukan pekerjaannya utuh saat dibuka kembali
- [ ] menjalankan Cek Kesiapan dan memahami temuan yang ditampilkan
- [ ] mengekspor JSON, XLSX, CSV, dan PNG
- [ ] mengimpor kembali JSON dan mendapatkan struktur, atribut, **serta posisi node** persis seperti sebelumnya
- [ ] mengekspor XLSX, menyuntingnya di Excel, mengimpornya kembali, dan mendapatkan struktur yang setara

---

# 24. Risiko

| Risiko | Mitigasi |
|---|---|
| Operator kehilangan pekerjaan karena LocalStorage terhapus | Indikator simpan, pengingat export, export sebagai akhir alur kerja yang eksplisit |
| Template diisi dengan format menyimpang | Dropdown data validation, preview import dengan temuan per baris |
| Taksonomi berubah karena regulasi baru | Seluruh taksonomi di satu file konfigurasi dengan `configVersion` |
| File lama tidak dapat dibuka setelah aplikasi berkembang | `schemaVersion` sejak MVP dan lapisan migrasi di `schema/` |
| Angka unit terhitung ganda | Node Unit tidak pernah menyimpan angka; agregat dihitung dari baris rincian keturunan |
| Tata letak hilang saat Rapikan | Masuk history dan dapat di-undo; tersedia Rapikan per subtree |
| Kanvas berat pada OPD besar | Batas rancangan 500 node, virtualisasi render, satu file satu OPD |
