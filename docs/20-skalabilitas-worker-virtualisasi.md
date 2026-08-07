# 20 — Skalabilitas: Worker, Virtualisasi, dan Rencana Persistensi Lanjutan

> **Status dokumen ini**: Fase 0–2, **Fase 3.1**, dan **Fase 3.2** (di bawah)
> **sudah selesai diimplementasikan**. Fase 0–2: branch `feat/skalabilitas-fase-0-2`,
> commit `2015a7b`/`d1d668f`, di-merge ke `master`. Fase 3.1–3.2: lihat §3.1/§3.2
> untuk detail lengkap + deviasi dari rencana asli (masing-masing punya
> beberapa penyesuaian nyata yang ditemukan saat implementasi, bukan cuma
> rencana yang dieksekusi apa adanya). **Fase 3.3 (sengaja ditunda, lihat
> trigger di §3.3) dan Fase 4 belum dikerjakan** — bagian itu ditulis sedetail
> rencana yang sudah dieksekusi supaya sesi berikutnya bisa langsung mulai
> tanpa riset ulang. Dokumen sumber asli (rencana lengkap 5 fase, dibuat di
> awal) ada di luar repo (`~/.claude/plans/asumsikan-app-ini-akan-compressed-blanket.md`,
> tidak ter-version) — dokumen ini adalah versi yang **disalin & diperbarui ke
> kondisi kode sungguhan**, supaya jadi rujukan tunggal yang bisa diandalkan.

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

## Fase 3 — Perombakan persistensi (3.1 & 3.2 SELESAI, 3.3 SENGAJA DITUNDA)

**Tujuan**: bikin biaya dashboard/autosave se-pemda O(jumlah OPD), bukan
O(total node se-pemda). Ini fix definitif untuk keluhan #2 (Fase 2 cuma
memindahkan biayanya ke worker thread — jumlah kerjanya tetap O(total node)).

**Rekomendasi urutan** (dari rencana awal, masih berlaku): kerjakan §3.1
(ringkasan) dan §3.2 (skema IndexedDB sungguhan) sekarang; §3.3 (body ter-chunk)
didesain tapi ditunda di balik trigger eksplisit.

### 3.1 — Ringkasan (summary) di samping body project — SELESAI

**Kenapa ini dulu**: nilai tertinggi per baris kode, dan **tidak butuh** migrasi
skema IndexedDB (§3.2) — berdiri sendiri di atas `idb-keyval` yang sudah ada.

**Bentuk record**, disimpan di key `pjb:v2:summary:<projectId>` — persis seperti
rencana, ditambahkan ke [persistence/types.ts](../src/persistence/types.ts):
`ProjectSummary { schemaVersion: 2, computedFrom, total, perKategori,
perJenjang, unplaced, nodeCount, findingCounts, linkedCodes }`.

**Yang dibangun** (semua di [persistence/storage.ts](../src/persistence/storage.ts)
kecuali disebutkan lain):
- `buildProjectSummary(project, cfg?, index?): ProjectSummary` — fungsi murni,
  memanggil `getCachedValidation`/`getCachedRecap` (WeakMap-memo Fase 1.2) sekali,
  membentuk `ProjectSummary`.
- `buildIndexEntry` **ditulis ulang** untuk memetik field dari
  `buildProjectSummary` alih-alih menghitung validate/recap sendiri —
  `ProjectIndexEntry` sekarang benar-benar "irisan tipis" dari `ProjectSummary`.
  Satu sumber kebenaran, bukan dua fungsi yang bisa melenceng.
- `getProjectSummary(id): Promise<ProjectSummary | null>` (export) dan
  `saveProjectSummary(id, summary)` (privat ke modul) — baca/tulis IDB langsung.
- `isProjectSummaryFresh(summary, currentUpdatedAt): summary is ProjectSummary`
  — type guard murni, `summary !== null && summary.computedFrom === currentUpdatedAt`.
- `updateIndexForProject` (dipanggil `saveProject` tiap kali project disimpan)
  sekarang **juga** memanggil `saveProjectSummary` — jadi summary selalu ditulis
  ulang tepat saat `ProjectIndexEntry`-nya ditulis ulang, tidak pernah terpisah.
- `deleteProjectData` juga menghapus record summary (cegah record yatim).
- `rebuildIndexFromStorage` (jalur pemulihan index korup, Fase 2.3) sekalian
  menulis ulang summary tiap project — body sudah ada di tangan di pass itu,
  tidak ada baca tambahan, jadi rebuild penuh juga "menyembuhkan" summary yang
  hilang/rusak untuk SEMUA project sekaligus.
- `computeGlobalBreakdown` (`selectors/globalBreakdown.ts`) dapat parameter
  opsional baru `opts.readSummary?: (id) => Promise<ProjectSummary|null>` di
  `GlobalBreakdownOptions`. Kalau disediakan DAN `summary.computedFrom ===
  entry.updatedAt` (freshness dicek terhadap `ProjectIndexEntry.updatedAt` yang
  SUDAH ada di `topLevel`, tidak pernah baca body project untuk cek ini),
  `summary.perKategori` dipakai langsung — `readProject` untuk entry itu **sama
  sekali tidak dipanggil**. Summary hilang/basi → fallback ke `readProject` +
  `computeRecap` (jalur lama, selalu benar). **Backward compatible**: parameter
  opsional, caller lama yang tidak pernah tahu summary ada (atau sengaja tidak
  memberinya, mis. test) tetap dapat perilaku persis sebelum Fase 3.1.
- Kedua consumer worker sudah di-wire: `analysis.worker.ts`'s case
  `'globalBreakdown'` dan `client.ts`'s `createInlineClient().globalBreakdown`
  sama-sama mengoper `readSummary: getProjectSummary`. `RecapDashboard.tsx`
  TIDAK perlu tahu summary ada sama sekali — optimasi ini sepenuhnya
  tersembunyi di balik `AnalysisWorkerClient.globalBreakdown()`.
  `laporanExporter.ts`'s `buildLaporanPemerintahWorkbook` juga menerima
  `readSummary` lewat `LaporanPemerintahOptions extends GlobalBreakdownOptions`
  (dioper `RecapDashboard.tsx`'s `handleExportLaporan` untuk jalur fallback
  langka saat `precomputedBreakdown` belum siap).

**Tiga deviasi sengaja dari rencana awal** (dengan alasan):
1. **Summary ditulis di main thread (`updateIndexForProject`), BUKAN lewat
   worker.** Rencana awal menyarankan worker sebagai penulis. Setelah
   diimplementasikan, ternyata tidak perlu: `getCachedValidation`/`getCachedRecap`
   yang dipanggil `buildProjectSummary` SUDAH berjalan di main thread pada
   setiap `saveProject` sejak Fase 1.2 (untuk mengisi `ProjectIndexEntry`) —
   menambahkan `saveProjectSummary` di titik yang sama itu bukan komputasi
   baru, cuma menyimpan hasil yang sudah dihitung. Worker cuma relevan untuk
   sisi BACA (dashboard membaca N summary tanpa buka N body) — dan itu **sudah**
   terjadi di dalam worker (`analysis.worker.ts`'s `globalBreakdown` case
   memanggil `getProjectSummary` di context worker-nya sendiri).
2. **Tidak butuh `scheduleSummaryRefresh` background debounce.** Rencana awal
   menduga perlu mekanisme "tulis ulang summary basi di background" terpisah
   dari alur save biasa. Ternyata tidak perlu: karena summary SELALU ditulis
   sinkron di `updateIndexForProject` (dipanggil setiap `saveProject`), sebuah
   project yang disimpan lewat jalur normal TIDAK PERNAH punya summary basi.
   Staleness cuma terjadi untuk dua kasus pathological yang sudah tertangani
   lewat fallback biasa: project yang tersimpan SEBELUM Fase 3.1 ini ada (summary
   `null` — fallback "hilang"), atau (secara teori) body yang ditulis di luar
   `saveProject` (tidak ada jalur begitu di kode saat ini).
3. **Tidak reuse `isEntryStale`.** Fungsi itu (di `selectors/dashboard.ts`)
   membandingkan `updatedAt` terhadap 30 hari (staleness LINK, docs/13) —
   konsepnya beda dari freshness summary (`computedFrom === updatedAt`, exact
   match, bukan threshold waktu). Dibuat helper terpisah (`isProjectSummaryFresh`)
   alih-alih memaksakan reuse yang semantiknya tidak cocok.

**Bonus correctness dari rencana awal (breakdown link node per-kategori) — BELUM
dikerjakan.** Masih caveat terbuka di
[globalBreakdown.ts](../src/selectors/globalBreakdown.ts) (angka project
tertaut belum dipecah per kategori). Tidak blocking, layak diambil kalau ada
waktu longgar.

**Test yang ditambahkan** (semua pure, tanpa IndexedDB — lihat catatan strategi
test di bawah):
- `tests/persistence.test.ts` — `buildProjectSummary` (computedFrom, round-trip
  dengan computeRecap/validateProject, nodeCount, konsistensi dengan
  buildIndexEntry) + `isProjectSummaryFresh` (fresh/stale/null).
- `tests/global-breakdown.test.ts` — 5 test baru: fast-path (readProject SAMA
  SEKALI TIDAK terpanggil saat summary fresh), fallback saat stale, fallback
  saat hilang, `readSummary` diomit sepenuhnya (perilaku pra-3.1 utuh), dan
  batch campuran (satu entry fresh + satu stale, dua-duanya kefold benar).

**Catatan strategi test — kenapa tidak ada test yang memanggil `getProjectSummary`/
`saveProjectSummary`/`saveProject` langsung**: repo ini TIDAK punya
`fake-indexeddb` atau polyfill IDB apa pun di suite test (`environment: 'node'`,
lihat `vite.config.ts`) — pola yang SUDAH ada sebelum Fase 3.1 (`buildIndexEntry`
selalu ditest lewat pemanggilan langsung fungsi murni, tidak pernah lewat
`saveProject`). Fase 3.1 mengikuti pola yang sama secara konsisten, bukan
kelalaian. Kalau nanti fungsi IDB-touching butuh ditest langsung (mis. sebagai
bagian §3.2 migrasi), itu keputusan yang layak didiskusikan eksplisit dulu
(nambah `fake-indexeddb` sebagai dev dependency) — jangan diam-diam ditambah.

### 3.2 — Skema IndexedDB sungguhan (`idb`, bukan `idb-keyval`) — SELESAI

**Kenapa**: `idb-keyval` cuma kasih satu object store key-value flat. Dua
masalah struktural yang tidak bisa diperbaiki tanpa ganti:
1. Enumerasi project butuh `keys()` (buffer SEMUA key) + filter prefix string.
2. Update SATU project butuh **read-modify-write SELURUH blob `ProjectIndex`**
   — di 300 OPD, tiap save menyentuh 300 entri untuk mengubah 1.

**Pustaka**: `idb@8` — dependency baru, dikonfirmasi eksplisit ke user
sebelum ditambah (lihat AskUserQuestion sebelum sub-fase ini dimulai).

**Yang dibangun** (semua file baru di `src/persistence/`):
- [db.ts](../src/persistence/db.ts) — `getPjbV2Db()`, membuka database
  **TERPISAH** `pjb_v2` (bukan `pjb_db` yang dipakai idb-keyval) lewat `idb`'s
  `openDB` + `upgrade` callback. Object store: `projects` (keyPath `id`),
  `entries` (keyPath `id`, index `by-kodeOPD` + `by-updatedAt`), `summaries`
  (key eksternal — `ProjectSummary` sendiri tidak punya field `id`), `meta`
  (satu record `activeId`).
- [projectBuilders.ts](../src/persistence/projectBuilders.ts) — `buildIndexEntry`,
  `buildProjectSummary`, `isProjectSummaryFresh` (semua dari Fase 3.1, dipindah
  dari `storage.ts` ke sini — **murni, TANPA IndexedDB**), + migrasi
  `normalizeProject`/`normalizeProjectDetailed`/`normalizeStrukturalHeads`
  (juga dipindah dari `storage.ts`), + `pickMostRecentId` (baru, dipakai
  `rebuildIndexFromStorage`). File ini dipisah dari `storage.ts`/`repository.ts`
  KHUSUS untuk memutus siklus impor (`repository.ts` butuh fungsi-fungsi ini,
  `storage.ts` re-export dari keduanya).
- [repository.ts](../src/persistence/repository.ts) — interface
  `ProjectRepository` + `class IdbRepository implements ProjectRepository`,
  singleton `export const repository`.
- [migrateV2.ts](../src/persistence/migrateV2.ts) — `migrateV2()`, dijaga flag
  LocalStorage `pjb:v2:migrated`. Dipanggil sekali di awal `bootstrapPersistence()`
  (`persistence/bootstrap.ts`), SEBELUM `getProjectIndex()` dipanggil.
- `persistence/storage.ts` — permukaan publik **tidak berubah** dari sisi
  pemanggil (nama & signature semua fungsi sama), isinya sekarang delegasi
  tipis ke `repository`. `customStore` (idb-keyval, `pjb_db`) **tetap
  diekspor** — masih dipakai (lihat "batas migrasi" di bawah).

**`ProjectRepository` yang jadi** — **BUKAN** persis 8 fungsi dari rencana
awal, ada **4 method tambahan**:
```ts
export interface ProjectRepository {
  getProjectIndex(): Promise<ProjectIndex>;
  getProject(id: string): Promise<Project | null>;
  getProjectWithMigrationFlag(id: string): Promise<{ project: Project; migrated: boolean } | null>;
  getProjectSummary(id: string): Promise<ProjectSummary | null>; // Fase 3.1, tidak disebut rencana 3.2 asli
  saveProject(project: Project): Promise<void>; // body+entry+summary+activeId, SATU transaksi
  deleteProjectData(id: string): Promise<void>;
  saveProjectIndex(index: ProjectIndex): Promise<void>; // bulk-replace, dipakai HANYA rebuildIndexFromStorage
  rebuildIndexFromStorage(): Promise<ProjectIndex>;
  estimateStorageUsage(): Promise<{ usedBytes: number; quotaBytes: number; percentUsed: number }>;
  // BARU, tidak ada di rencana awal — lihat "kenapa 4 method tambahan" di bawah
  putProjectBody(project: Project): Promise<void>;
  deleteProjectBody(id: string): Promise<void>;
  writeEntriesAndSummaries(items: Array<{ project: Project; carry: ... }>): Promise<ProjectIndexEntry[]>;
  patchLastExportedAt(id: string, iso: string): Promise<void>;
}
```

**Lima deviasi sengaja dari rencana awal** (dengan alasan):

1. **Database TERPISAH (`pjb_v2`), bukan object store baru di `pjb_db`.**
   Rencana awal menyebut `archives`/`ui` sebagai object store di database yang
   sama dengan `projects`/`entries`/`summaries`. Ternyata tidak praktis:
   `idb-keyval` membuka `pjb_db` tanpa mengekspos hook `upgrade` versi-nya
   sendiri — menambah store lain ke situ butuh trik version-bump lintas-library
   yang rapuh (dua library berbeda sama-sama "memiliki" skema db yang sama).
   Dua database terpisah co-exist dengan aman di IndexedDB (fakta platform,
   bukan trik) — jadi dipisah saja: `pjb_v2` (idb) untuk data yang jadi
   masalah skala, `pjb_db` (idb-keyval) tetap untuk sisanya.
2. **`archives` dan `ui` (customOpd) TIDAK dimigrasi — batas migrasi eksplisit.**
   Keduanya BUKAN bagian dari masalah skala (satu generasi arsip per project,
   segelintir entri OPD kustom — tidak tumbuh dengan jumlah OPD), jadi sengaja
   dibiarkan di `pjb_db`/idb-keyval. `persistence/customOpd.ts` **tidak
   disentuh sama sekali**. `persistence/bulkImport.ts`'s `archiveProject`/
   `getArchivedProject` juga tetap menyimpan salinan arsip di `pjb_db` — cuma
   SUMBER body-nya yang sekarang dibaca dari `repository` (database baru).
3. **4 method tambahan di `ProjectRepository`, di luar rencana ~8 fungsi.**
   Alasan konkret: `persistence/bulkImport.ts` dan `persistence/reminder.ts`
   TERNYATA langsung menyentuh `idb-keyval`/`customStore` (bypass permukaan
   8-fungsi `storage.ts` sepenuhnya) — ditemukan saat implementasi, bukan
   sebelumnya. Kalau dibiarkan, project yang ditulis lewat bulk-import akan
   masuk ke database LAMA sementara semua yang lain baca dari database BARU
   — **korupsi-diam-diam, bukan cuma performa**. Jadi `bulkImport.ts` (two-phase
   commit: `putProjectBody` fase 1, `writeEntriesAndSummaries` fase 2 — TIDAK
   menyentuh `activeId`, persis perilaku lama) dan `reminder.ts`'s
   `markProjectExported` (`patchLastExportedAt`, O(1) patch satu field
   ketimbang RMW seluruh index — ini salah satu jalur tulis index PALING
   SERING dipanggil, tiap export berhasil) ikut ditulis ulang memakai
   `repository`, bukan cuma jalur `saveProject` interaktif.
4. **`rebuildIndexFromStorage` pakai cursor `idb` SUNGGUHAN**, menggantikan
   trik baca-dua-pass Fase 2.3 (yang cuma kompromi karena `idb-keyval` tidak
   punya cursor). Satu body per waktu, satu pass, bukan dua.
5. **`IdbRepository.getProjectSummary` mempertahankan try/catch dari Fase 3.1**
   (kembalikan `null` pada KEGAGALAN APA PUN, bukan cuma "tidak ada") — ini
   BUKAN keputusan desain di awal, tapi **regresi nyata yang ketahuan lewat
   test** (`tests/worker-client.test.ts` gagal karena `openDB()` throw di
   Vitest node environment tanpa `indexedDB`), diperbaiki sebelum lanjut.
   Method `repository` LAIN (`getProject`, `saveProject`, dst.) **sengaja
   TIDAK** diberi try/catch serupa — errornya harus tetap propagate (ditangkap
   `bootstrapPersistence`'s try/catch di lapisan atas), karena getProjectSummary
   punya kontrak "opsional/best-effort dengan fallback" yang eksplisit sejak
   Fase 3.1 sementara baca/tulis project TIDAK boleh gagal diam-diam.

**Nuansa perilaku yang berubah** (tidak berbahaya, tapi layak dicatat): urutan
`ProjectIndex.entries` dari `getProjectIndex()` sekarang urutan KEY (`id`)
lewat `getAll()`, bukan urutan insert/update-terakhir seperti array
`idb-keyval` sebelumnya. Tidak ada consumer yang bergantung pada urutan ini
(dashboard/daftar OPD semua sort ulang sendiri berdasarkan kriteria masing-
masing) — dicek eksplisit sebelum dianggap aman.

**Migrasi** — persis rencana awal: dijaga flag LocalStorage `pjb:v2:migrated`,
idempotent (semua tulisan `put`/overwrite, bukan `add`/append) & resumable
(TIDAK PERNAH menghapus `pjb_db` lama — salin-maju murni, aman diulang dari
awal kalau terhenti). Dipanggil di awal `bootstrapPersistence()`. Menghormati
`activeId` TERAKHIR dari index lama (bukan cuma "paling baru diubah" hasil
`rebuildIndexFromStorage`).

**Catatan strategi test (konsisten dengan Fase 3.1)**: `IdbRepository` dan
`migrateV2()` sendiri **TIDAK** ditest langsung (butuh `indexedDB` sungguhan,
repo ini tidak punya `fake-indexeddb` — keputusan sadar, bukan kelalaian, lihat
catatan yang sama di §3.1). Yang ditest: fungsi MURNI di
`projectBuilders.ts` (`buildIndexEntry`, `buildProjectSummary`,
`pickMostRecentId` — `tests/persistence.test.ts`) dan `isV2Migrated()`'s
jalur aman-tanpa-LocalStorage (`tests/migrate-v2.test.ts`). Verifikasi
tambahan yang DIPAKAI sebagai pengganti test IDB langsung: `npx vite build`
sungguhan (memastikan `idb` ter-bundle benar ke `analysis.worker.js`, tidak
cuma lolos `tsc`) — dijalankan sebagai bagian verifikasi sub-fase ini, bukan
cuma `tsc --noEmit`/`vitest run` seperti fase-fase lain.

**Belum dikerjakan dari rencana awal**: tidak ada — §3.2 selesai sepenuhnya
sesuai cakupan yang didefinisikan ulang di atas (termasuk perluasan cakupan ke
`bulkImport.ts`/`reminder.ts` yang tidak disebut rencana awal tapi terbukti
perlu untuk korektnes).

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
| 3.1 Ringkasan | **SELESAI** | Dashboard jadi O(jumlah OPD); prasyarat 3.2 |
| 3.2 Skema IndexedDB (`idb` + `ProjectRepository`) | **SELESAI** | Update-satu-project jadi O(1) record, bukan RMW seluruh index; sambungan ke Fase 4 |
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
