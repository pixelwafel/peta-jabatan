# Peta Jabatan Builder

> Aplikasi berbasis React & TypeScript untuk menyusun, memvisualisasikan, dan merakapitulasi Peta Jabatan serta Analisis Beban Kerja (ABK) Perangkat Daerah (OPD) Pemerintah Daerah di Indonesia.

---

## 🚀 Fitur Utama

- **Kanvas Interaktif & Auto-Layout**: Visualisasi struktur hirarki perangkat daerah menggunakan `@xyflow/react` dan auto-layout otomatis berbasis **Dagre** (Top-Bottom / Left-Right).
- **Detail Baris Jabatan & Chip Picker**: Editor rincian jenjang fungsional, struktural, dan pelaksana. Perhitungan selisih (`eksisting - kebutuhan`) secara otomatis dan berwarna.
- **Engine Rekapitulasi Post-Order**: Penjumlahan angka kebutuhan dan eksisting dari bawah ke atas secara otomatis (*bottom-up aggregate*) dalam satu kali traversal post-order.
- **Penyimpanan Lokal IndexedDB & Multi-Proyek**: Penyimpanan otomatis (autosave 500ms) menggunakan IndexedDB (`idb-keyval`) dengan kuota hingga 50 MB, pendeteksian konflik tab via `BroadcastChannel`, dan manajemen multi-proyek.
- **Pipeline Ekspor Serbaguna**: Ekspor ke format **Excel (.xlsx)** (dilengkapi format teks pada kolom nomor agar `1.10` tidak berubah menjadi `1.1`, lembar Referensi, Rekap, dan Info), **CSV (.csv)** dengan BOM UTF-8, **JSON (.json)**, serta **Gambar PNG (.png)**.
- **Pipeline Impor Cerdas & Round-Trip**: Membaca file template Excel / JSON, toleran terhadap alias nama kolom (`status jabatan`, `bezetting`, `eselon`, `formasi`), koersi angka Indonesia (`1.234` dan `1,5`), serta pelacakan gap nomor induk (*gap-walking*).
- **Engine Validasi & Pemeriksaan Kesiapan Data**: Pengecekan 20+ aturan integritas struktur (duplikasi nomor/kode, unit tanpa kepala, angka pada node unit, rincian negatif, dsb) secara otomatis dengan dialog Kesiapan Ekspor.

---

## 🛠️ Teknologi & Dependensi

| Layer | Teknologi |
|---|---|
| **Core Framework** | React 18, TypeScript, Vite 6 |
| **Styling** | Tailwind CSS v3, Lucide React (Icons) |
| **State & Mutasi** | Zustand v5, Immer v10, Zod v3 |
| **Kanvas & Layout** | `@xyflow/react` v12, `@dagrejs/dagre` v1 |
| **Penyimpanan** | `idb-keyval` v6 (IndexedDB Wrapper) |
| **Ekspor & Capture** | `xlsx` v0.18 (SheetJS), `html-to-image` v1 |
| **Pengujian** | Vitest v3 |

---

## 📥 Penggunaan & Perintah Utama

### 1. Instalasi Dependensi
```bash
npm install
```

### 2. Jalankan Mode Pengembang (Local Dev Server)
```bash
npm run dev
```
Akses aplikasi di browser pada alamat `http://localhost:5173`.

### 3. Jalankan Pengujian Unit (Vitest)
```bash
npm test
```

### 4. Build untuk Produksi
```bash
npm run build
```

---

## 🏗️ Struktur Proyek

```
peta-jabatan/
├── docs/                      # Dokumen spesifikasi teknis (M0 - M15)
├── src/
│   ├── components/            # Komponen UI React
│   │   ├── canvas/            # Komponen Kanvas, UnitCard, JabatanCard, HierarchyEdge
│   │   ├── dialogs/           # Dialog Modal (ProjectManager, Export, Import, Readiness, Schema)
│   │   ├── property/          # Panel Properti, RincianEditor, JenjangChips, ClassificationEditor
│   │   ├── recap/             # Panel Rekapitulasi per Unit, Kategori, dan Jenjang
│   │   ├── shell/             # Layout Shell (Toolbar, LeftSidebar, RightSidebar, StatusBar)
│   │   ├── tree/              # Komponen Pohon Struktur (TreeView)
│   │   └── unplaced/          # Panel Work Queue Node Belum Ditempatkan (UnplacedPanel)
│   ├── config/                # Konfigurasi Taksonomi (taxonomy.json, resolver, labels)
│   ├── export/                # Engine Ekspor (columnSpec, rowGenerator, xlsx, csv, png, json)
│   ├── import/                # Engine Impor (columnMapper, rowParser, groupRows, buildStructure)
│   ├── models/                # Tipe Data & Interface (node, edge, project, derived)
│   ├── persistence/           # Storage IndexedDB, Autosave, Reminder, Bootstrap
│   ├── schema/                # Skema Zod & Migrasi Schema
│   ├── selectors/             # Selectors Memoized (structureIndex, totals, recap, validation, tree)
│   ├── store/                 # State Store Zustand (projectStore, historyStore, uiStore)
│   └── utils/                 # Utilities (layout Dagre, numbering, uuid)
└── tests/                     # Test Suites Vitest (canvas, property, recap, persistence, export, import, validation)
```

---

## 📜 Lisensi & Pengembang

Dikembangkan sebagai solusi pembuatan Peta Jabatan Perangkat Daerah berbasis web yang responsif, aman, dan tanpa ketergantungan server backend.
