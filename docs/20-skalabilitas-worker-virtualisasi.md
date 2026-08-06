# 20 — Skalabilitas: Worker, Virtualisasi, dan Rencana Persistensi Lanjutan

> **Status dokumen ini**: Fase 0–2 (di bawah) **sudah selesai diimplementasikan dan
> di-commit** (branch `feat/skalabilitas-fase-0-2`, commit `2015a7b` dan `d1d668f`).
> Fase 3–4 **belum dikerjakan** — bagian itu ditulis sedetail rencana yang sudah
> dieksekusi supaya sesi berikutnya bisa langsung mulai tanpa riset ulang.
> Dokumen sumber asli (rencana lengkap 5 fase, dibuat di awal) ada di luar repo
> (`~/.claude/plans/asumsikan-app-ini-akan-compressed-blanket.md`, tidak
> ter-version) — dokumen ini adalah versi yang **disalin & diperbarui ke kondisi
> kode sungguhan**, supaya jadi rujukan tunggal yang bisa diandalkan.

## Context

Target: aplikasi ini (client-side murni — React 18 + Zustand/Immer + React Flow +
Dagre, IndexedDB via `idb-keyval`, SheetJS CE) harus tetap responsif menampung
**ratusan project OPD**, total **puluhan ribu–jutaan node**. Tidak ada backend.

Tiga keluhan yang mengarahkan prioritas (disebut user di awal, urutan berdasarkan
dampak nyata di kode, bukan urutan penyebutan):
1. Buka/ganti project lambat.
2. Dashboard & laporan se-pemda berat.
3. Import/export XLSX besar bikin macet.

Dua bug/temuan awal yang jadi pemicu Fase 1.1 (sudah diperbaiki):
- `bootstrap.ts` dulu menjadwalkan **full autosave** (`validateProject` +
  `computeRecap` + read-modify-write seluruh `ProjectIndex`) setiap kali project
  dibuka/diganti — bukan cuma saat benar-benar diedit.
- `autosave.ts`'s `scheduleSave` dulu **menimpa** `pendingProject` yang tertunda
  — ganti project dalam jendela 500ms membuang perubahan yang belum tersimpan.

Rencana dibagi 5 fase. **Fase 0–2 selesai** (dokumen ini fase-fase itu, ringkas,
dengan pointer ke kode). **Fase 3–4 rencana rinci**, belum dikerjakan.

---

## Ringkasan Fase 0–2 (SELESAI)

### Fase 0 — Pengukuran

- [src/utils/fixture.ts](../src/utils/fixture.ts): `generateFixture(opts)` (LCG
  ber-seed, id sepanjang UUID, timestamp tetap) + `generateIndexFixture(opdCount,
  nodesPerOpd)`. `generate500NodeFixture()` dipertahankan apa adanya (dipakai test
  lama secara literal).
- Counter berbasis panggilan (bukan ms — anti-flaky di CI):
  `getRecapComputeCount()`/`resetRecapComputeCount()` di
  [src/selectors/recap.ts](../src/selectors/recap.ts),
  `getValidateCount()`/`resetValidateCount()` di
  [src/selectors/validation.ts](../src/selectors/validation.ts).

### Fase 1 — Perbaikan klien, tanpa perubahan skema

| # | Isi | File kunci |
|---|---|---|
| 1.1 | `rev` counter di `ProjectState`; autosave cuma jalan saat `rev` naik (bukan saat `project` object berganti karena `setProject`); `flushSave()` sebelum tiap `setProject` project yang sedang terbuka | [store/projectStore.ts](../src/store/projectStore.ts), [persistence/bootstrap.ts](../src/persistence/bootstrap.ts), [persistence/autosave.ts](../src/persistence/autosave.ts) |
| 1.2 | Memo `WeakMap<Project, …>` untuk `computeRecap`/`validateProject`, keyed identitas `Project` (aman karena `produceWithPatches` Immer memberi referensi baru tiap commit) | `getCachedRecap` di [selectors/recap.ts](../src/selectors/recap.ts), `getCachedValidation` di [selectors/validation.ts](../src/selectors/validation.ts) |
| 1.3 | `getStructureIndex` — LRU 4 slot, signature primitif (`typeById: Map<id,type>`, bukan referensi node yang bisa jadi Immer draft proxy revoked) | [selectors/structureIndex.ts](../src/selectors/structureIndex.ts) |
| 1.4 | Hilangkan O(N²): `isLocked` lewat `nodeById.get`, `visibleNodeIds` jadi satu BFS, `ParentSelect` hitung `descendantsOf` sekali ke `Set` | [selectors/guards.ts](../src/selectors/guards.ts), [selectors/visibility.ts](../src/selectors/visibility.ts), [components/property/ParentSelect.tsx](../src/components/property/ParentSelect.tsx) |
| 1.5 | Persempit subscription whole-project; `React.memo(TreeRow)` + `useCallback` semua handler | [components/tree/TreeView.tsx](../src/components/tree/TreeView.tsx), [hooks/useDeleteNodeRequest.ts](../src/hooks/useDeleteNodeRequest.ts) |
| 1.6 | Hentikan Dagre per-keystroke di tab Outline; `computeLayoutCached` (signature geometri, bukan string key) | [utils/layout.ts](../src/utils/layout.ts), [hooks/useLiveLayout.ts](../src/hooks/useLiveLayout.ts) |
| 1.7 | `useDebouncedValue` (150ms default) di pencarian OPD/jabatan | [hooks/useDebouncedValue.ts](../src/hooks/useDebouncedValue.ts) |
| 1.8 | Code splitting: `React.lazy` semua dialog berat, dynamic `import('xlsx')`/`'jszip'`/`'html-to-image'`, `manualChunks` di Vite. Entry bundle **1.62MB → 591KB raw / 180KB gzip** | [vite.config.ts](../vite.config.ts), `src/export/*Exporter.ts`, `src/import/*Importer.ts` |
| 1.9 | `zNode` lengkap: `kepalaUnit`, `locked` ditambah (schema Zod dulu diam-diam membuang field ini di export→import) | [schema/node.ts](../src/schema/node.ts) |

### Fase 2 — Worker + virtualisasi

| # | Isi | File kunci |
|---|---|---|
| 2.1 | Pulau selector bebas-store: `useRecap` hook pindah ke `hooks/`, `scheduleCacheRefresh` pindah ke `store/linkCacheRefresh.ts` lewat pola injeksi `setLiveResolveHandler` | [hooks/useRecap.ts](../src/hooks/useRecap.ts), [store/linkCacheRefresh.ts](../src/store/linkCacheRefresh.ts), [selectors/linkResolver.ts](../src/selectors/linkResolver.ts) |
| 2.1b | Layering ditegakkan mekanis (ESLint **tidak terpasang** di repo ini — sengaja pakai skrip Node ringan, bukan nambah dependency) | [scripts/check-layering.mjs](../scripts/check-layering.mjs), `npm run check:layering` |
| 2.2 | `analysis.worker.ts` (validate/recap/indexEntry/globalBreakdown) + `client.ts` (request/response ber-id, AbortSignal→cancel, progress) + `protocol.ts` (tipe pesan). Fallback inline otomatis saat `typeof Worker === 'undefined'` (Vitest) | [src/workers/](../src/workers/) |
| 2.3 | `RecapDashboard` pakai worker untuk breakdown per-kategori; laporan & ekspor konsolidasi **reuse** breakdown yang sudah dihitung + progress/abort; `rebuildIndexFromStorage` jadi baca-lepas (memori terbatas, bukan literal cursor IDB — lihat catatan di kode) | [components/dashboard/RecapDashboard.tsx](../src/components/dashboard/RecapDashboard.tsx), [export/laporanExporter.ts](../src/export/laporanExporter.ts), [export/consolidatedExporter.ts](../src/export/consolidatedExporter.ts), [persistence/storage.ts](../src/persistence/storage.ts) |
| 2.4 | Semaphore parse (`MAX_CONCURRENT_PARSES=3`) di ImportDialog; `builtProject` dibangun sekali (bukan rebuild seluruh antrean tiap render); BulkExportDialog dapat AbortSignal+progress+`streamFiles`. **`xlsx.worker.ts` sengaja ditunda** (scope besar — lihat §"xlsx.worker.ts yang ditunda" di bawah) | [components/dialogs/ImportDialog.tsx](../src/components/dialogs/ImportDialog.tsx), [components/dialogs/BulkExportDialog.tsx](../src/components/dialogs/BulkExportDialog.tsx) |
| 2.5 | Virtualisasi manual (window + spacer `translateY`, pola sama `InstanceGrid.tsx`): `TreeView` (flatten+windowed, `TreeRow` non-rekursif), `OpdListSidebar`, `ProjectManagerDialog` | [selectors/tree.ts](../src/selectors/tree.ts) (`flattenVisibleTree`), [components/tree/TreeView.tsx](../src/components/tree/TreeView.tsx), [components/shell/OpdListSidebar.tsx](../src/components/shell/OpdListSidebar.tsx), [components/dialogs/ProjectManagerDialog.tsx](../src/components/dialogs/ProjectManagerDialog.tsx) |
| 2.6 | Pagar pengaman React Flow: potong node per-kedalaman (bukan ubah `node.collapsed`) begitu `visible.size > 1500` di tab Preview, banner + tombol "Tampilkan Semua" | `guardVisibleByDepth` di [selectors/visibility.ts](../src/selectors/visibility.ts), [components/canvas/Canvas.tsx](../src/components/canvas/Canvas.tsx) |

### Konstanta yang sudah ditetapkan (referensi cepat untuk tuning nanti)

| Konstanta | Nilai | Lokasi |
|---|---|---|
| `MAX_SLOTS` (structureIndex LRU) | 4 | `selectors/structureIndex.ts` |
| Debounce pencarian | 150ms | `hooks/useDebouncedValue.ts` |
| `MAX_CONCURRENT_PARSES` | 3 | `components/dialogs/ImportDialog.tsx` |
| `ROW_HEIGHT` TreeView | 36px | `components/tree/TreeView.tsx` |
| `ROW_HEIGHT` OpdListSidebar | 52px | `components/shell/OpdListSidebar.tsx` |
| `ROW_HEIGHT`/`CARD_HEIGHT` ProjectManagerDialog | 94px / 84px | `components/dialogs/ProjectManagerDialog.tsx` |
| `VISIBLE_NODE_GUARD_LIMIT` (Canvas) | 1500 | `components/canvas/Canvas.tsx` |
| `THIRTY_DAYS_MS` (link stale) | 30 hari | `selectors/validation.ts` (tidak berubah di Fase 2) |

### Bentuk `src/workers/` sekarang (dasar buat Fase 3 & xlsx.worker.ts nanti)

```
src/workers/
  protocol.ts    — tipe pesan (WorkerRequest union, WorkerResponse union),
                   TIDAK ada runtime code, aman diimpor dua arah.
  client.ts      — createAnalysisWorkerClient(): AnalysisWorkerClient
                   { validate, recap, indexEntry, globalBreakdown, terminate }
                   Cabang typeof Worker === 'undefined' → createInlineClient()
                   (fallback fungsi murni langsung, dipakai Vitest).
  analysis.worker.ts — jalan di thread worker sungguhan. Mengimpor SELECTOR
                   murni (validateProject, computeRecap, computeGlobalBreakdown)
                   + persistence/storage.ts (buildIndexEntry murni, getProject
                   yang buka idb-keyval sendiri di context worker).
```

Protokol request (`protocol.ts`) — union `WorkerRequest`:
`{op:'validate'|'recap', id, project, cfg, index}`,
`{op:'indexEntry', id, project, carry, index}`,
`{op:'globalBreakdown', id, topLevel}`,
`{op:'cancel', id}`. Response: `{id,type:'progress',done,total}` |
`{id,type:'result',result}` | `{id,type:'error',message}`.

**Menambah operasi baru** (dipakai Fase 3 §3.1 di bawah): tambah varian ke
`WorkerRequest` di `protocol.ts`, tambah `case` di `analysis.worker.ts`'s
`ctx.onmessage`, tambah method di `AnalysisWorkerClient` interface + kedua
implementasi (`createInlineClient`, `createRealWorkerClient`) di `client.ts`.

### `xlsx.worker.ts` yang ditunda — kenapa, dan apa yang dibutuhkan kalau dikerjakan

Diputuskan bersama user untuk **tidak** dikerjakan di Fase 2.4 karena jauh lebih
besar/berisiko dari sisa Fase 2.4: bukan cuma file worker baru, tapi merombak
pipeline `columnMapper → rowParser → groupRows → buildStructure →
structuralMerge → matrixImporter` supaya jalan lewat batas `postMessage`, sambil
menjaga staging/two-phase-commit (`persistence/bulkImport.ts`) tetap benar.
Trigger nyata untuk mengerjakannya: laporan konkret bahwa parsing satu file XLSX
besar terasa macet — bukan asumsi. Kalau trigger itu muncul:

1. `src/workers/xlsx.worker.ts` — terima `ArrayBuffer` (bukan `File`, `File` tidak
   selalu bisa di-clone lintas versi browser lama; `await file.arrayBuffer()` di
   main thread dulu, baru `postMessage(buf, [buf])` sebagai **Transferable**
   zero-copy).
2. Worker `import('xlsx')` sendiri, jalankan pipeline import penuh, kirim balik
   `ImportPreview` (JSON biasa, structured-cloneable) atau hasil `XLSX.write(...,
   {type:'array'})` untuk arah export (juga Transferable).
3. `ImportDialog.tsx`'s `parseEntry` ganti dari panggilan sinkron langsung jadi
   `await xlsxWorkerClient.parse(arrayBuffer)`.
4. **Uji regresi wajib**: seluruh `tests/import.test.ts`, `tests/matrix-import.test.ts`
   harus tetap hijau — pipeline-nya sama persis, cuma pindah thread.

---

## Baseline verifikasi (dipakai konsisten Fase 0–2, pakai lagi di Fase 3–4)

1. `npm run check:layering` — `src/selectors/**` dan `src/workers/**` harus
   bebas impor `@/store/*`/`@/components/*`.
2. `npx tsc --noEmit -p .` — baseline **55 error pra-eksisting** (per commit
   `d1d668f`), semuanya di file yang **tidak** disentuh Fase 0–2 (mis.
   `export/columnSpec.ts`, `export/rowGenerator.ts`, banyak `tests/*.test.ts`
   dengan fixture `OrgNode` yang belum diperbarui field `order`-nya). Kalau
   angkanya naik dan errornya bukan di file yang baru disentuh sesi ini →
   regresi asli, investigasi. Kalau di file yang memang disentuh, cek dulu
   dengan `git stash` di baseline sebelum panik.
3. `npx vitest run` — baseline **6 test flaky dikonfirmasi berulang kali**
   (CPU-contention lingkungan lokal, BUKAN regresi kode — dibuktikan lewat
   `git stash` + run ulang di kondisi bersih, hasilnya sama/lebih buruk):
   - `tests/canvas-layout.test.ts` — "Subtree Tidy keeps subtree root..."
   - `tests/canvas-layout.test.ts` — "Unplaced nodes are arranged in a column..."
   - `tests/export.test.ts` — "exportCsv outputs UTF-8 string starting with BOM..."
   - `tests/history-store.test.ts` — "no-op commits produce 0 history entries..."
   - `tests/performance-canvas.test.ts` — "StructureIndex rebuild count is exactly 1..."
   - `tests/performance-canvas.test.ts` — "Dagre Tidy layout computation on 500 nodes executes under 100ms"

   Kalau salah satu dari 6 ini gagal sendirian, itu bukan sinyal regresi. Kalau
   ada kegagalan **DI LUAR** daftar ini, itu sinyal asli.
4. `npx vitest run tests/performance-*.test.ts` — assertion berbasis counter
   (`getRecapComputeCount`, `getValidateCount`, dll), bukan ms. Tetap jalankan
   ini utuh sebelum/sesudah tiap sub-langkah Fase 3.

---

## Fase 3 — Perombakan persistensi (BELUM DIKERJAKAN)

**Tujuan**: bikin biaya dashboard/autosave se-pemda O(jumlah OPD), bukan
O(total node se-pemda). Ini fix definitif untuk keluhan #2 (Fase 2 cuma
memindahkan biayanya ke worker thread — jumlah kerjanya tetap O(total node)).

**Rekomendasi urutan** (dari rencana awal, masih berlaku): kerjakan §3.1
(ringkasan) dan §3.2 (skema IndexedDB sungguhan) sekarang; §3.3 (body ter-chunk)
didesain tapi ditunda di balik trigger eksplisit.

### 3.1 — Ringkasan (summary) di samping body project

**Kenapa ini dulu**: nilai tertinggi per baris kode, dan **tidak butuh** migrasi
skema IndexedDB (§3.2) — bisa berdiri sendiri di atas `idb-keyval` yang ada
sekarang. Ini juga prasyarat konseptual §3.2 (tahu dulu bentuk data yang mau
disimpan, baru desain store-nya).

**Bentuk record baru**, disimpan di key `pjb:v2:summary:<projectId>`:

```ts
// src/persistence/types.ts — tambahkan
export interface ProjectSummary {
  schemaVersion: 2;
  computedFrom: string; // == project.updatedAt saat summary ini dihitung
  total: RecapBucket;
  perKategori: RecapBucket[];
  perJenjang: RecapBucket[];
  unplaced: RecapBucket;
  nodeCount: number;
  findingCounts: { errors: number; warnings: number };
  linkedCodes: string[];
}
```

**Siapa yang menulis**: worker `analysis.worker.ts` yang sama yang sudah dipicu
autosave (lewat operasi `indexEntry` yang sudah ada — perluas jadi juga menulis
summary di operasi yang sama, atau tambah operasi `writeSummary` terpisah kalau
mau tetap murni/testable tanpa IDB — **pilih pola yang sama dengan
`buildIndexEntry`**: fungsi murni `buildProjectSummary(project, cfg, index):
ProjectSummary` di `selectors/` atau `persistence/storage.ts`, dipanggil oleh
worker, hasilnya ditulis lewat `idb-keyval`'s `set()` di dalam
`analysis.worker.ts` (worker sudah punya handle `customStore` lewat
`persistence/storage.ts`, lihat §"Bentuk src/workers/ sekarang" di atas).

**Siapa yang membaca**:
- `buildIndexEntry` (`persistence/storage.ts`) — **berhenti** memanggil
  `getCachedValidation`/`getCachedRecap` langsung; baca `ProjectSummary`
  tersimpan dulu. Kalau `summary.computedFrom !== project.updatedAt` → **stale**,
  fallback ke compute langsung (path lama, tetap benar tapi lebih lambat) DAN
  jadwalkan recompute di background lewat worker. Vocab "stale" sudah ada:
  `isEntryStale` di [selectors/dashboard.ts](../src/selectors/dashboard.ts) —
  pola serupa, cek dulu apakah bisa dipakai ulang langsung atau perlu varian baru
  khusus summary (kemungkinan perlu — `isEntryStale` sekarang bandingkan
  `updatedAt` terhadap 30 hari, bukan `computedFrom` terhadap `updatedAt`).
- `computeGlobalBreakdown` (`selectors/globalBreakdown.ts`) — ganti total dari
  "baca N body, `computeRecap` tiap satu" jadi **fold atas N record `ProjectSummary`
  kecil** (300 OPD × ~1KB ≈ 300KB, bukan N × body penuh). Ini yang bikin dashboard
  jadi O(jumlah OPD). **Perhatikan**: `computeGlobalBreakdown` sekarang menerima
  `readProject: (id) => Promise<Project|null>` sebagai parameter (pola inject,
  supaya testable tanpa IDB — lihat `tests/global-breakdown.test.ts`). Ganti jadi
  menerima `readSummary: (id) => Promise<ProjectSummary|null>` dengan pola
  parameter-injection yang SAMA — jangan import `idb-keyval` langsung di
  selector, itu melanggar layering yang baru saja ditegakkan Fase 2.1b.
  **Test yang harus di-update**: `tests/global-breakdown.test.ts` (5 test, semua
  pakai `readProject` mock — perlu jadi `readSummary` mock, cek assertion apa
  yang berubah).

**Staleness saat menulis** (bukan cuma baca): kalau `buildIndexEntry` fallback ke
compute-langsung karena summary stale, request "recompute + tulis ulang summary"
seharusnya dikirim ke worker (fire-and-forget, tidak blocking save) — pola baru,
belum ada contohnya di kode; paling dekat adalah `scheduleSave` di
`persistence/autosave.ts` (debounce + fire-and-forget), tapi itu untuk `saveProject`
bukan untuk worker call. Kemungkinan butuh `scheduleSummaryRefresh(projectId)`
kecil di `persistence/` yang debounce mirip `scheduleSave`.

**Bonus correctness yang hampir gratis di titik ini** (disebut di rencana awal,
masih valid): simpan breakdown per-kategori dari kontribusi LINK di summary —
memperbaiki caveat yang sudah terdokumentasi di
[globalBreakdown.ts:20-28](../src/selectors/globalBreakdown.ts) (angka project
tertaut belum dipecah per kategori hari ini). Opsional, kerjakan kalau sempat,
bukan blocker.

**Test baru yang dibutuhkan**:
- `buildProjectSummary` murni — round-trip dengan `computeRecap`/`validateProject`
  (angka summary === angka compute-langsung untuk project yang sama).
- `buildIndexEntry` dengan summary fresh vs stale vs tidak ada (3 skenario).
- `computeGlobalBreakdown` dengan `readSummary` mock, termasuk kasus campuran
  (sebagian OPD summary-nya stale, harus tetap menghasilkan angka benar via
  fallback).

### 3.2 — Skema IndexedDB sungguhan (`idb`, bukan `idb-keyval`)

**Kenapa**: `idb-keyval` cuma kasih satu object store key-value flat. Dua
masalah struktural yang tidak bisa diperbaiki tanpa ganti:
1. Enumerasi project butuh `keys()` (buffer SEMUA key) + filter prefix string
   — lihat `rebuildIndexFromStorage` di `persistence/storage.ts` (sudah
   diperbaiki jadi baca-lepas per Fase 2.3, tapi `keys()`-nya sendiri masih
   membuffer seluruh daftar key sekaligus — itu jauh lebih murah dari body
   penuh, jadi bukan prioritas, tapi tetap bukan solusi struktural).
2. Update SATU project butuh **read-modify-write SELURUH blob `ProjectIndex`**
   (`saveProjectIndex` menulis ulang array `entries` lengkap tiap kali) — di
   300 OPD, tiap save menyentuh 300 entri untuk mengubah 1.

**Pustaka pilihan**: `idb` (penulis sama dengan `idb-keyval`, ~1.5KB,
memberi transaksi & index sungguhan) — **bukan** `dexie` (~25KB, API lebih luas
dari kebutuhan).

**Object store yang direncanakan**:
```
projects   — key: id,           value: Project (body penuh)
summaries  — key: id,           value: ProjectSummary (dari §3.1)
entries    — key: id,           value: ProjectIndexEntry, index: kodeOPD, updatedAt
archives   — key: generation id (dari persistence/archive.ts yang sudah ada)
ui         — key kecil-kecil (dari persistence/customOpd.ts dkk)
```

**Batas desain yang WAJIB dipegang** (dari rencana awal, ini yang membuat
migrasi ini aman): permukaan publik
[persistence/storage.ts](../src/persistence/storage.ts) — kira-kira 8 fungsi:
`getProjectIndex`, `getProject`, `getProjectWithMigrationFlag`, `saveProject`,
`deleteProjectData`, `saveProjectIndex`, `buildIndexEntry`,
`rebuildIndexFromStorage`, `estimateStorageUsage` — **tidak berubah sama
sekali** dari sisi pemanggil. Semua yang ada di atasnya (`bootstrap.ts`,
`autosave.ts`, `projectStore.ts`, `projectIndexStore.ts`, semua komponen React,
`analysis.worker.ts`) lewat fungsi-fungsi itu, tidak pernah `idb-keyval`/`idb`
langsung. **Formalkan jadi interface eksplisit**:

```ts
// src/persistence/repository.ts (BARU)
export interface ProjectRepository {
  getProjectIndex(): Promise<ProjectIndex>;
  getProject(id: string): Promise<Project | null>;
  getProjectWithMigrationFlag(id: string): Promise<{ project: Project; migrated: boolean } | null>;
  saveProject(project: Project): Promise<void>;
  deleteProjectData(id: string): Promise<void>;
  saveProjectIndex(index: ProjectIndex): Promise<void>;
  rebuildIndexFromStorage(): Promise<ProjectIndex>;
  estimateStorageUsage(): Promise<{ usedBytes: number; quotaBytes: number; percentUsed: number }>;
}
```

`persistence/storage.ts` jadi `export const repository: ProjectRepository =
new IdbRepository();` dan semua fungsi top-level yang ada sekarang jadi
re-export tipis (`export const getProject = (id) => repository.getProject(id)`)
supaya **nol** call site berubah. Interface ini juga sambungan langsung ke Fase
4 (`HttpRepository` nanti implement interface yang sama).

**Migrasi**: `src/persistence/migrateV2.ts` (baru) — dijaga flag
`pjb:v2:migrated` (di LocalStorage, konsisten dengan `pjb:v1:ui`/`pjb:v1:acks`
yang sudah di LocalStorage per catatan amandemen di
[doc 10](./10-persistence-projects.md)), idempotent & resumable (baca semua key
`pjb:v1:project:*` dari `idb-keyval`, tulis ke object store `projects` baru
lewat `idb`, per-project — kalau proses terhenti di tengah, flag belum ke-set,
resume dari awal aman karena `idb`-write bersifat overwrite bukan append), modal
progress (`{done, total}`, pola sama seperti export/import dialog yang sudah
ada). **Prasyarat keras**: Fase 1.9 (skema Zod lengkap) sudah selesai — migrasi
memutar tiap body lewat `zProject.safeParse` sebelum ditulis ke skema baru;
menjalankan itu atas project dengan skema Zod yang masih lossy tidak bisa
dipulihkan. (1.9 **sudah selesai** — prasyarat ini sudah terpenuhi.)

**Test yang dibutuhkan**: `tests/migrate-v2.test.ts` (baru) — migrasi dari
fixture `idb-keyval` lama ke `idb` baru, interrupted-and-resumed (jalankan
separuh, "crash", jalankan lagi, hasil akhir harus identik dengan jalan mulus),
dan idempotency (jalankan dua kali berturut-turut, hasil kedua = hasil pertama).

### 3.3 — Body ter-chunk (DESAIN SAJA, JANGAN BANGUN TANPA TRIGGER)

**Trigger eksplisit**: tulis autosave > 150ms secara konsisten (ukur lewat
`perfMark` yang sudah ada, span `autosave` — lihat Fase 0.2), ATAU satu project
melewati ~8.000 node. Biaya terukur: satu node+edge dengan id UUID ≈ 537 byte
serialized. 8.000 node ≈ 4.3MB — baca/deserialize itu masih dalam batas wajar
(~50-100ms); autosave yang menulis ULANG SELURUHNYA tiap commit itu yang jadi
mahal di atas titik ini.

**Desain** (tulis ke dokumen kalau/ketika dikerjakan, JANGAN dibangun sekarang):
`pjb:v2:project:<id>:meta` + `…:chunk:<k>`, bucket node berukuran tetap, counter
`generation` per project ditulis terakhir di dalam SATU transaksi `idb` (atomicity
yang tidak bisa diberikan `idb-keyval`, alasan lain kenapa §3.2 harus lebih dulu).

**Insight kunci yang sudah diverifikasi ada di kode**: `produceWithPatches` di
[store/projectStore.ts](../src/store/projectStore.ts) (dipanggil tiap `commit()`)
**sudah** memberi tahu persis path/index node mana yang berubah lewat array
`patches` — itu input alami buat pelacak dirty-chunk, tidak perlu mesin baru.

**Prasyarat keras sebelum §3.3 bisa jalan** (berlaku independen, layak
dikerjakan meski §3.3 sendiri tidak pernah dikirim — cek dulu apakah masih
relevan saat mengerjakan ini, kode mungkin sudah berubah): `deleteNode`,
`setParent`, `moveNode` di `store/projectStore.ts` saat ini mengganti SELURUH
array `nodes`/`edges` (jadi patch Immer-nya `replace /nodes` yang mencakup
semuanya, bukan patch granular per-index) — **tulis ulang ketiganya supaya
splice/mutate IN PLACE di dalam draft Immer**. Ini juga independen mengecilkan
memori history (patch inverse yang tersimpan di `historyStore`, dibatasi 50
entri, saat ini membawa salinan array PENUH per delete/move — itu sendiri bug
memori yang layak diperbaiki terlepas dari chunking).

**Test yang harus diperluas kalau/ketika dikerjakan**: `tests/history-store.test.ts`
dengan fixture 500 node — verifikasi undo/redo round-trip masih benar setelah
`deleteNode`/`moveNode`/`setParent` ditulis ulang jadi splice in-place (patch
path granular, bukan replace seluruh array).

---

## Fase 4 — Escape hatch backend (BELUM DIKERJAKAN, hanya atas trigger bernama)

**Bukan soal performa.** Setelah Fase 3, komputasi agregat adalah O(jumlah OPD).
Trigger sebenarnya:

1. **Multi-user** — dua tab sudah bentrok hari ini (`autosave.ts` cuma
   memperingatkan lewat `BroadcastChannel`, tidak mencegah). 300 OPD berarti
   ~300 operator; satu profil browser tidak bisa jadi system of record.
2. **Durabilitas** — IndexedDB bisa dievaksi (khususnya Safari/iOS, ~1GB +
   evaksi setelah ~7 hari tak dipakai — lihat plafon di bawah), tidak ada
   backup.
3. **Resolusi link lintas-OPD** — link node ([doc 13](./13-link-nodes.md))
   resolve terhadap index LOKAL (`selectors/linkResolver.ts`). Kalau file OPD A
   ada di mesin operator lain, link itu permanen `cached`/`unresolved`. Ini
   sudah membatasi produk HARI INI, bukan cuma di skala besar.
4. **Audit/approval** — siapa mengirim, kapan, siapa menyetujui. Mustahil
   client-side.
5. Penyimpanan berkelanjutan > ~500MB, atau Safari/iOS jadi klien wajib.

**Plafon client-side (kondisi Fase 3 sudah beres)**: 300 OPD × 1.000 node ≈
160MB body; satu generasi arsip menggandakan ke ~320MB. Chrome/Edge ~60% disk
bebas (aman). Firefox 10% disk / cap grup 2GB (aman). **Safari/iOS ~1GB +
evaksi 7 hari — tebing sebenarnya.** Mitigasi murah yang bisa jalan SEKARANG
(tidak perlu tunggu Fase 4): panggil `navigator.storage.persist()` saat
bootstrap, tampilkan pemakaian di `StatusBar.tsx` dengan peringatan di 70%
(fungsi `estimateStorageUsage` sudah ada di `persistence/storage.ts`, tinggal
dipanggil + ditampilkan — ini bisa dikerjakan kapan saja, tidak terikat urutan
fase manapun).

**Bentuk server minimal** (Postgres + REST tipis):

```sql
opd(id, kode, nama, kelompok)
project(id, opd_id, revision, updated_at, updated_by, body jsonb)
project_summary(project_id, revision, total jsonb, per_kategori jsonb,
                 per_jenjang jsonb, finding_counts jsonb)
```

```
GET  /projects       -> ProjectIndexEntry[]   (bentuk sudah ada di persistence/types.ts)
GET  /projects/:id   -> Project
PUT  /projects/:id   (If-Match: revision, optimistic concurrency)
GET  /summary        -> agregat se-pemda, dihitung SQL
```

`project_summary` di server memetakan 1:1 ke `ProjectSummary` klien (§3.1) —
**Fase 3 adalah persiapan migrasi backend**, jangan dilewati meski backend sudah
di depan mata.

**Perubahan klien**: terkurung di `ProjectRepository` (§3.2) —
`IdbRepository` (yang sudah ada) + `HttpRepository` (baru, implement interface
yang sama). IndexedDB tetap jadi cache offline
([doc 17](./17-pwa-offline.md) sudah mempertimbangkan ini); sync saat reconnect
dengan deteksi konflik berbasis `revision`, pakai ulang dialog konflik
`BroadcastChannel` yang sudah ada sebagai model UX.

**Non-goal eksplisit**: JANGAN pindahkan `validateProject`/`computeRecap` ke
server. Keduanya harus tetap client-side untuk editing offline dan umpan balik
instan (dan sekarang sudah jalan di Worker — memindahkannya ke server berarti
mundur, bukan maju). Server hanya menghitung agregat lintas-OPD yang memang
butuh data semua operator sekaligus.

---

## Risiko & invariant yang harus dijaga (berlaku lintas fase)

1. **Structural sharing Immer menanggung beban.** Memo `WeakMap` (Fase 1.2)
   dan cache `getStructureIndex` (Fase 1.3) bergantung pada identitas objek
   `Project`. **Jangan pernah** `structuredClone`/`JSON.parse(JSON.stringify(project))`
   di main thread — itu membatalkan tiap memo dan tiap cek `===` React.
   `postMessage` ke Worker mengkloning UNTUK worker tapi meninggalkan referensi
   main-thread utuh (aman). **Aturan keras yang sudah dipegang sejak Fase 2 dan
   HARUS terus dipegang di Fase 3+**: worker mengembalikan data TURUNAN saja
   (`Finding[]`, `Recap`, `ProjectIndexEntry`, `ProjectSummary`, `RecapBucket[]`),
   **tidak pernah** `Project` yang masuk kembali ke store. Pengecualian sah
   satu-satunya: import (yang memang membuat project baru dari nol).
2. **Undo berbasis patch harus tetap jalan.** Patch `historyStore` merujuk path
   seperti `/nodes/12/nama`. `setProject` sudah memanggil `clearHistory()`
   (menutup jalur load project lain) — itu tetap harus dipertahankan di Fase 3.
   Kalau §3.3 (chunking) pernah mengurutkan ulang `nodes`, patch tersimpan
   rusak — makanya §3.3 mensyaratkan `deleteNode`/`moveNode`/`setParent` ditulis
   ulang jadi splice in-place LEBIH DULU (lihat §3.3 di atas).
3. **Layering ditegakkan `scripts/check-layering.mjs`, bukan konvensi.**
   `src/selectors/**` dan `src/workers/**` tidak boleh impor `@/store/*` atau
   `@/components/*`. Kalau Fase 3 menambah fungsi baru di `selectors/`
   (mis. `buildProjectSummary`), jalankan `npm run check:layering` sebelum
   commit — bukan opsional, ini persis jenis pelanggaran yang dulu diam-diam
   muncul di `linkResolver.ts`/`recap.ts` sebelum Fase 2.1.
4. **`ProjectRepository` (§3.2) adalah kontrak, bukan detail implementasi.**
   Begitu ada, setiap kode baru yang butuh baca/tulis project HARUS lewat
   fungsi top-level `persistence/storage.ts` yang sudah ada (yang
   mendelegasikan ke `repository`), tidak pernah impor `idb`/`idb-keyval`
   langsung di luar `persistence/`.

---

## Urutan & effort (perkiraan, dari rencana awal — belum divalidasi ulang
## terhadap kode sungguhan karena belum dikerjakan)

| Fase | Effort | Membuka |
|---|---|---|
| 3.1 Ringkasan | 3–4 jam | Dashboard jadi O(jumlah OPD); prasyarat 3.2 |
| 3.2 Skema IndexedDB (`idb` + `ProjectRepository`) | 4–6 jam | Update-satu-project jadi O(1) record, bukan RMW seluruh index; sambungan ke Fase 4 |
| 3.3 Body ter-chunk | didesain saja, tidak dikerjakan | Hanya kalau trigger (§3.3) muncul |
| 4 Backend | ≥3–4 minggu | Hanya atas trigger bernama (multi-user/durabilitas/link lintas-OPD/audit), TIDAK ADA yang soal performa |

**Dalam Fase 3, kerjakan 3.1 lebih dulu** — berdiri sendiri, tidak butuh
migrasi skema, dan langsung mengecilkan biaya dashboard yang paling terasa.

## Verifikasi Fase 3 (tambahan di atas baseline §"Baseline verifikasi")

1. `performance-dashboard.test.ts` (tes baru, disebut di rencana Fase 0 tapi
   belum pernah dibuat — buat sekarang kalau mulai Fase 3): index 300 entri,
   assert `readProject` (bukan `readSummary`) dipanggil **0 kali** kecuali ada
   entri stale.
2. `tests/history-store.test.ts` diperluas 500 node (lihat §3.3) — WAJIB kalau
   §3.3 mulai dikerjakan, sebelum splice-in-place mendarat di `deleteNode`/
   `moveNode`/`setParent`.
3. Manual di browser: `generateIndexFixture(300, 2000)` di-seed ke IndexedDB
   (skrip dev, belum ada — perlu dibuat: baca `src/utils/fixture.ts`, tulis
   lewat `persistence/storage.ts` langsung, bukan lewat UI, supaya 300 project
   bisa masuk dalam hitungan detik bukan diklik satu-satu), buka dashboard,
   ekspor laporan se-pemda — rekam di Performance panel Chrome, target: tidak
   ada long task > 50ms di main thread SELAIN saat membangun XLSX (yang masih
   di main thread sampai `xlsx.worker.ts` dikerjakan).
