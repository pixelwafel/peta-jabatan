# 18 — Refactor Layout 3-Kolom: Outline sebagai Editor Utama, Canvas sebagai Preview

## Context

Canvas berbasis React Flow terasa tidak semulus yang diharapkan sebagai alat *edit* struktur (drag manual, snapping, tata letak bebas). Tujuannya sekarang: pindah ke tata letak 3-kolom baru — **Kolom 1: daftar OPD**, **Kolom 2: Peta Jabatan berbentuk outline yang bisa dilipat (jadi editor utama)**, **Kolom 3: info/properti node terpilih** — sambil mempertahankan logika dan aturan yang sudah dikembangkan (validasi hierarki, model data, undo/redo, penomoran).

Hasil eksplorasi kode: ini **bukan refactor besar**. Layer logic (`store/`, `selectors/`, `models/`) sudah lepas dari React Flow. `TreeView.tsx` (outline collapsible) dan `RightSidebar.tsx` (panel properti) **sudah ada dan sudah dipakai** di atas store/selector yang sama. Auto-layout (Dagre, `utils/layout.ts`) juga **sudah ada** ("Rapikan Layout" di Toolbar) — tidak perlu algoritma tata letak baru.

Keputusan desain (dari diskusi dengan user):
- **Opsi C**: outline (kolom 2) jadi satu-satunya tempat mengedit struktur/hierarki. Canvas jadi mode **preview/print read-only** — tidak ada lagi drag-to-reparent atau drag posisi di canvas.
- **Auto-layout dari struktur**: di mode preview, posisi node dihitung otomatis (Dagre) dari hierarki + urutan outline. Tidak ada drag manual di canvas sama sekali.

Konsekuensi inti: karena posisi x/y tidak lagi dikontrol user, urutan sibling (selama ini disimpulkan dari `position.x`) butuh sumber kebenaran baru yang eksplisit dan dikendalikan dari outline: field `order`.

---

## Step 1 — Model: field `order` untuk urutan sibling eksplisit

**File: `src/models/node.ts`**

```ts
export interface OrgNode {
  // ...existing fields...
  order: number; // NEW — urutan sibling, sumber kebenaran untuk sort & renumber
}
```

Pseudocode migrasi data lama (proyek yang sudah tersimpan tanpa `order`):

**File: `src/persistence/storage.ts`, di dalam `getProject(id)`**

```
function getProject(id):
    raw = kv.get(projectKey(id))
    if raw is null: return null
    return normalizeProject(raw)

function normalizeProject(project):
    if project.nodes.every(n => n.order is a number):
        return project  # already migrated, no-op

    # group nodes by parent, order by their CURRENT position.x (old behavior),
    # tie-break by nomor string compare, then nama
    childrenByParent = groupBy(project.nodes, n => parentIdOf(n, project.edges))
    for parentId, siblings in childrenByParent:
        siblings.sortBy(n => [n.position.x, n.nomor, n.nama])
        for index, node in enumerate(siblings):
            node.order = index

    return project   # NOTE: do not persist automatically here;
                      # let normal commit() flow re-save it on next edit,
                      # OR call saveProject(project) once explicitly — decide during impl
```

---

## Step 2 — Selectors: sort by `order`, bukan `position.x`

**File: `src/selectors/tree.ts`**

```
function sortSiblings(treeNodes, nodeByIdMap):
    return treeNodes.sort((a, b) => {
        A = nodeByIdMap.get(a.id)
        B = nodeByIdMap.get(b.id)
        if A.order != null and B.order != null:
            return A.order - B.order
        # fallback safety net for any not-yet-normalized data
        return A.nama.localeCompare(B.nama, 'id')
    })
```

`buildTree()` tidak berubah selain lewat `sortSiblings`.

---

## Step 3 — Store: `order` di `addNode`, `renumberFromStructure`, dan action baru `moveNode`

**File: `src/store/projectStore.ts`**

```
# 3a. addNode — append ke akhir daftar sibling
addNode({ type, nama, parentId, position }):
    siblingCount = childrenOf(currentProject.nodes, currentProject.edges, parentId).length
    # ...existing id/position logic...
    commit('Tambah node', draft => {
        draft.nodes.push({ ...existingFields, order: siblingCount })
        # ...existing edge push...
    })


# 3b. renumberFromStructure — sort children by order, bukan position.x
renumberFromStructure():
    walk(nodeId, prefix):
        assignments.set(nodeId, formatNomor(prefix))
        kids = childrenOf(...).sort((a, b) => a.order - b.order)
        kids.forEach((k, i) => walk(k.id, [...prefix, i+1]))


# 3c. moveNode — action BARU: reparent + reorder dalam satu commit,
#     dipakai oleh drag-and-drop di outline
moveNode(nodeId, targetParentId, targetIndex):
    current = get().project
    if targetParentId and not canSetParent(current.nodes, current.edges, nodeId, targetParentId):
        return  # cycle guard, sama seperti setParent()

    commit('Pindahkan node', draft => {
        # 1. hapus hierarchy edge lama (identik dgn setParent)
        draft.edges = draft.edges.filter(e => !(e.kind === 'hirarki' && e.target === nodeId))
        if targetParentId:
            draft.edges.push({ id: uuid(), source: targetParentId, target: nodeId, kind: 'hirarki' })

        # 2. re-index `order` pada sibling BARU (sisipkan di targetIndex)
        newSiblings = childrenOf(draft.nodes, draft.edges, targetParentId)
            .filter(n => n.id !== nodeId)
        newSiblings.splice(targetIndex, 0, nodeIdPlaceholder)
        newSiblings.forEach((n, i) => { if (n.id) n.order = i })
        movedNode.order = targetIndex

        # 3. re-index `order` pada sibling LAMA (tutup celah bekas posisi nodeId)
        oldSiblings = childrenOf(draft.nodes, draft.edges /* sebelum edit */, oldParentId)
            .filter(n => n.id !== nodeId)
        oldSiblings.forEach((n, i) => { n.order = i })
    })
```

Semua aturan lain (`canSetParent` di `selectors/guards.ts`, invariant rincian, undo/redo via Immer patches) **tidak berubah** — dipakai apa adanya.

---

## Step 4 — Outline (`TreeView.tsx`) jadi editor penuh

**File: `src/components/tree/TreeView.tsx`** (perluas komponen existing, jangan tulis ulang)

```
# 4a. Inline rename
TreeRow:
    state: isEditing = false
    onDoubleClick(nameLabel):
        isEditing = true
    onRenameInput blur/Enter:
        updateNode(node.id, { nama: inputValue })
        isEditing = false
    render: isEditing ? <input autoFocus defaultValue={node.nama} .../> : <span>{node.nama}</span>


# 4b. Drag-and-drop reorder & reparent (native HTML5 DnD — tidak ada lib DnD
#     di project saat ini, tidak perlu nambah dependency untuk kasus ini)
TreeRow:
    draggable = true
    onDragStart(e): e.dataTransfer.setData('text/plain', node.id)
    onDragOver(e): e.preventDefault(); setDropIndicator(computeDropPosition(e, rowRect))
        # dropPosition ∈ { 'before', 'after', 'inside' } berdasar posisi cursor
        # relatif ke row (atas 25% = before, bawah 25% = after, tengah = inside)
    onDrop(e):
        draggedId = e.dataTransfer.getData('text/plain')
        if draggedId === node.id: return
        if dropPosition === 'inside':
            moveNode(draggedId, targetParentId=node.id, targetIndex=0)
        else:
            parentId = parentOf(node).id
            siblingIndex = indexOf(node, among its siblings)
            targetIndex = dropPosition === 'after' ? siblingIndex + 1 : siblingIndex
            moveNode(draggedId, parentId, targetIndex)
        clearDropIndicator()


# 4c. Keyboard shortcuts — DIPINDAH dari Canvas.tsx ke hook bersama
```

**File baru: `src/hooks/useStructureShortcuts.ts`**

```
function useStructureShortcuts():
    # extract 1:1 dari Canvas.tsx baris 126-214, TANPA logic Escape/Ctrl+0
    # (yang itu tetap milik Canvas — fit-view adalah konsep kanvas, bukan struktur)
    on keydown:
        if target is input/textarea/contentEditable: return
        Ctrl/Cmd+Z            -> undo() / redo() (shift)
        Tab (ada selection)   -> addNode({ type: 'jabatan', parentId: selected })
        Enter (ada selection) -> addNode({ type: 'jabatan', parentId: parentOfSelected })
        Ctrl/Cmd+D            -> duplicateNode(selected, 'node-only')
        Ctrl/Cmd+Shift+D      -> duplicateNode(selected, 'subtree')
        Delete/Backspace      -> deleteNode(selected, 'node-only')
```

Dipasang di `TreeView.tsx` (bukan lagi di `Canvas.tsx`).

Tombol aksi kecil per baris (add child/sibling, duplicate, delete) — trigger UI baru yang memanggil store actions yang **sudah ada** (`addNode`, `deleteNode`, `duplicateNode`); tidak ada logic baru selain pemicu.

---

## Step 5 — Canvas jadi mode Preview read-only

**File: `src/components/canvas/Canvas.tsx`**

```
# Hapus:
#   - handleDragStart, handleDragStop, dragSession, onNodesChange (drag-related)
#   - seluruh blok useEffect keyboard shortcuts (baris 126-214) -> sudah pindah ke Step 4c
# Ubah:
#   - <ReactFlow nodesDraggable={false} ... />
#   - tetap dengar Escape (clearSelection) & Ctrl+0 (fitView) saja

InnerCanvas():
    liveLayout = useLiveLayout(nodes, edges, { direction: 'TB', scope: 'all', showJenjang })
    # liveLayout: Map<nodeId, {x,y}> — dihitung ulang tiap nodes/edges berubah,
    # TIDAK ditulis ke store/commit (murni derived, tidak masuk riwayat undo)

    rfNodes = nodes.filter(visible).map(n => ({
        ...existingFields,
        position: liveLayout.get(n.id) ?? n.position,  # fallback for safety
    }))

    render <ReactFlow nodes={rfNodes} nodesDraggable={false} ... />
```

**File baru: `src/hooks/useLiveLayout.ts`** (ekstrak dari `computeLayout` di `utils/layout.ts`, dipakai bareng oleh Canvas & TreeView)

```
function useLiveLayout(nodes, edges, opts):
    return useMemo(() => computeLayout(nodes, edges, opts), [nodes, edges, opts])
```

**File: `src/components/tree/TreeView.tsx`** — `handleFocus` (baris 118-136) diubah untuk pakai `useLiveLayout()` yang sama alih-alih `target.position.x/y`, supaya "fokus ke canvas" akurat terhadap posisi yang benar-benar dirender di mode preview.

**File: `src/components/shell/Toolbar.tsx`** — tombol "Rapikan Layout" & action `applyLayout` (store) jadi tidak diperlukan (layout selalu otomatis). Hapus tombolnya; putuskan saat implementasi apakah `applyLayout` di store dihapus juga atau dibiarkan dead code sampai dipastikan tidak ada pemakai lain (`grep` cepat sebelum hapus).

---

## Step 6 — Kolom 3 (properti): tidak berubah

`src/components/property/*`, `RightSidebar.tsx` — **zero changes**. Sudah selection-driven murni via `uiStore.selectedNodeIds`.

---

## Step 7 — Kolom 1: Daftar OPD (net-new UI, logic backend sudah ada)

**File baru: `src/components/shell/OpdListSidebar.tsx`**

```
OpdListSidebar():
    index = useState<ProjectIndex>()
    useEffect(() => getProjectIndex().then(setIndex), [])   # sudah ada di persistence/storage.ts

    render:
        <SearchInput onChange={filterTerm} />
        list filteredEntries.map(entry =>
            <OpdListItem
                active={entry.id === currentProject.id}
                onClick={() => getProject(entry.id).then(setProject)}   # store action sudah ada
                label={entry.namaOPD} kode={entry.kodeOPD}
            />
        )
        <Button onClick={openProjectManagerDialog}>Kelola...</Button>  # buka dialog existing utk impor/duplikat/hapus
```

Pola ini adalah versi inline dari `ProjectManagerDialog.tsx` baris 51-120 — tidak ada logic backend baru, hanya UI. `ProjectManagerDialog.tsx` **dipertahankan** untuk aksi lanjutan.

---

## Step 8 — Perombakan `ShellLayout.tsx` & `LeftSidebar.tsx`

**File: `src/components/shell/ShellLayout.tsx`**

```
InnerShellLayout():
    render 3-column grid:
        col1: <OpdListSidebar />                         # BARU
        col2: <StructurePanel />                          # was LeftSidebar, direname/dipecah
        col3: <RightSidebar />                             # tidak berubah
```

**File: `src/components/shell/LeftSidebar.tsx` → direname jadi `src/components/shell/StructurePanel.tsx`**

```
StructurePanel():
    activeTab: 'outline' | 'preview' | 'unplaced' | 'recap'  # was 'tree' | 'unplaced' | 'recap'

    render tabs:
        'outline' -> <TreeView />          # editor utama, default tab
        'preview' -> <Canvas />            # read-only, dibungkus ReactFlowProvider
        'unplaced' -> <UnplacedPanel />    # tidak berubah
        'recap' -> <RecapPanel />          # tidak berubah
```

Catatan: `ReactFlowProvider` yang sekarang membungkus seluruh `ShellLayout` (karena Canvas & TreeView berbagi `useReactFlow()`) tetap perlu membungkus `StructurePanel` (bukan cuma tab preview), karena `TreeView.handleFocus` juga makai `useReactFlow().setCenter`.

---

## Ringkasan file yang disentuh

| File | Perubahan |
|---|---|
| `src/models/node.ts` | + field `order` |
| `src/persistence/storage.ts` | + normalisasi `order` saat load proyek lama |
| `src/selectors/tree.ts` | `sortSiblings` pakai `order` |
| `src/store/projectStore.ts` | `addNode`/`renumberFromStructure` pakai `order`; + action `moveNode` |
| `src/components/tree/TreeView.tsx` | + inline rename, drag reorder/reparent, shortcuts, tombol aksi |
| `src/hooks/useStructureShortcuts.ts` | BARU — diekstrak dari `Canvas.tsx` |
| `src/hooks/useLiveLayout.ts` | BARU — wrapper `computeLayout` dipakai Canvas & TreeView |
| `src/components/canvas/Canvas.tsx` | hapus drag & shortcut lama; posisi dari `useLiveLayout` |
| `src/components/shell/Toolbar.tsx` | hapus tombol "Rapikan Layout" |
| `src/components/property/*`, `RightSidebar.tsx` | tidak berubah |
| `src/components/shell/OpdListSidebar.tsx` | BARU |
| `src/components/shell/LeftSidebar.tsx` | rename → `StructurePanel.tsx`, tambah tab outline/preview |
| `src/components/shell/ShellLayout.tsx` | grid 3-kolom baru |
| `docs/18-outline-refactor.md` | dokumen ini |

## Verifikasi

1. `npm run build` / `tsc` — pastikan tidak ada type error dari field `order` baru dan pemindahan kode.
2. Jalankan test yang ada: `tests/canvas-layout.test.ts`, `tests/performance-canvas.test.ts` — sesuaikan bila mengasumsikan drag manual atau `position.x` sebagai sumber urutan.
3. `npm run dev`, uji manual:
   - Tambah/hapus/duplikat node, ubah parent via drag di outline, reorder sibling via drag — cek urutan & penomoran (`renumberFromStructure`) konsisten dengan `order`.
   - Pindah antar OPD via Kolom 1 — store & undo history ter-reset benar (`setProject` sudah clear history).
   - Tab "Preview" — layout Dagre otomatis rapi tanpa klik "Rapikan", node tidak bisa digeser manual.
   - Pilih node di outline → Kolom 3 (properti) update seperti sebelumnya.
   - Buka proyek lama (data tanpa field `order`) — normalisasi di `getProject` tidak merusak urutan yang terlihat sebelumnya.
