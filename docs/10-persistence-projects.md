# 10 — Persistence & Projects

> ## Amendment (v2): the backend is IndexedDB
>
> Moving the dashboard and delegated-operator volumes into MVP breaks the
> LocalStorage budget: 40+ projects centrally (~12 MB) and ~28 for the Health
> operator (~3 MB) against a ~5 MB cap. Project bodies and the index therefore
> live in **IndexedDB** behind a thin async wrapper (idb-keyval or equivalent),
> keeping the exact key structure below. Read the rest of this document with
> that substitution:
>
> - `localStorage.setItem/getItem` on `pjb:v1:*` keys → `await storage.set/get`
> - The quota section (§2) survives with new numbers: design target **50 MB**,
>   warning threshold at 70% of the browser-reported estimate
>   (`navigator.storage.estimate()`), and the same non-dismissible
>   export-first dialog on failure
> - The `storage` event listener for two-tab detection (§8) is replaced by a
>   `BroadcastChannel('pjb')` ping on every save — same warning dialog
> - `pjb:v1:ui` and `pjb:v1:acks` stay in LocalStorage: tiny, synchronous, and
>   useful before the async store is open
> - `visibilitychange`/`beforeunload` flushes become fire-and-forget async
>   writes; the debounce shortens to **500 ms** since the write no longer
>   blocks the main thread
> - Private-mode and disabled-storage detection probes IndexedDB instead
>
> New index fields (consumed by docs 13 and 14): `totalEksisting`,
> `findingCounts`, `linkedCodes`, `origin` — all written by `updateIndex` on
> every save, and by bulk import for received files.
>
> The project manager additionally gains **search** (name and code substring),
> **grouping** by the `kelompok` of `daftar-opd.json` with "Lainnya" for
> unmatched codes, an **origin marker** distinguishing created from imported
> projects, and the **bulk JSON import** entry point specified in doc 14 §4.

## Purpose

Autosave to LocalStorage without losing work, hold several agency files at once, and
survive the fact that LocalStorage is bound to one browser on one machine — which
the operator will discover at the worst possible moment unless the UI tells them
first.

---

## 1. Storage layout

```
pjb:v1:index                 → ProjectIndex        (small, read on startup)
pjb:v1:project:<uuid>        → Project             (one per project)
pjb:v1:ui                    → persisted UI prefs
pjb:v1:acks                  → one-time acknowledgments
```

```ts
interface ProjectIndex {
  version: 1;
  activeId: string | null;
  entries: ProjectIndexEntry[];
}

interface ProjectIndexEntry {
  id: string;
  namaOPD: string;
  kodeOPD: string;
  nodeCount: number;
  totalKebutuhan: number;
  updatedAt: string;
  lastExportedAt: string | null;      // drives the unsaved-work warning
}
```

Separating the index from project bodies means the project list renders instantly
without deserializing every project. At 500 nodes a project is 200–400 KB; parsing
ten of them on startup to draw a list would be a visible delay.

`lastExportedAt` exists to answer one question: *has this work left the browser?*
It is what the reminder in §5 is built on.

### Persistent storage

IndexedDB data on Chromium can be **evicted** by the browser under storage pressure
unless the origin has been granted **persistent storage**. Request it once, on the
first successful save:

```ts
async function requestPersistentStorage(): Promise<void> {
  if (!navigator.storage?.persist) return;           // API not available
  const persisted = await navigator.storage.persist();
  if (!persisted) {
    // Denial is silent in Chrome. It typically means:
    //   - The site is not bookmarked / not added to home screen
    //   - A managed enterprise policy blocks the grant
    // Do NOT show an error — most operators will never notice the denial, and the
    // export reminder already mitigates the risk. Log it for diagnostics only.
    console.warn('navigator.storage.persist() denied — data subject to eviction');
  }
}
```

Call `requestPersistentStorage()` fire-and-forget after the first successful write
to IndexedDB. Subsequent saves do not need to re-request — the grant is persistent
across sessions.

**Government enterprise Chrome:** Group policies often silently deny persistent
storage requests. This is acceptable: the tool functions without it (IndexedDB
eviction only happens under extreme storage pressure), and the export reminder
is the primary safety net. A denied grant is never shown to the operator as an
error.

---

## 2. Autosave

```ts
// IndexedDB writes are async and non-blocking — debounce can be shorter than LocalStorage.
const SAVE_DEBOUNCE = 500;

const scheduleSave = debounce(async (project: Project) => {
  ui.setSaveStatus('saving');
  try {
    await storage.setProject(project.id, project);   // idb-keyval set()
    await updateIndex(project);                       // also async
    ui.setSaveStatus('saved');
    ui.setLastSavedAt(new Date().toISOString());
  } catch (err) {
    handleSaveError(err, project);
  }
}, SAVE_DEBOUNCE);
```

Called from `commit` (doc 03 §2), so every mutation schedules a save and nothing
else needs to remember to.

500 ms is appropriate for IndexedDB: writes happen off the main thread, so they
don't block rendering even at worst-case timing. Serialization of a 500-node project
is roughly 5–15 ms (the `JSON.stringify` is still on main thread), but the write
itself is async. Shorter than the original 800 ms for LocalStorage because the write
no longer risks a synchronous jank.

**Flush on `visibilitychange` and `beforeunload`:**

```ts
window.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') scheduleSave.flush();
  // flush() returns a Promise; fire-and-forget is acceptable here —
  // the browser keeps the page alive long enough for IDB commits to complete.
});
window.addEventListener('beforeunload', e => {
  scheduleSave.flush();                              // best-effort async flush
  if (hasUnexportedChanges()) {
    e.preventDefault();
    e.returnValue = '';                              // browser-generic confirm dialog
  }
});
```

`visibilitychange` matters more than `beforeunload` in practice — it fires on mobile
backgrounding and tab switches, where `beforeunload` may not.

The `beforeunload` guard fires only when there are changes never exported, not on
every close. A confirmation on every tab close is a confirmation nobody reads.

### Quota exhaustion

IndexedDB quota is negotiated per-origin. Design target is **50 MB**; `navigator.storage
.estimate()` provides the browser's reported estimate. Warn when usage exceeds 70%
of the estimate (passive warning in the project manager). On write failure the error
is a `DOMException` with `name === 'QuotaExceededError'`, same as LocalStorage.

```ts
async function handleSaveError(err: unknown, project: Project) {
  const isQuota = err instanceof DOMException &&
    (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED');

  ui.setSaveStatus('error');

  if (isQuota) {
    dialog.open({
      title: 'Penyimpanan browser penuh',
      body: 'Pekerjaan tidak dapat disimpan otomatis. Ekspor file JSON sekarang '
          + 'agar tidak hilang, lalu hapus project lama yang sudah diekspor.',
      actions: [
        { label: 'Ekspor JSON sekarang', primary: true, onClick: () => exportJson(project) },
        { label: 'Kelola project', onClick: () => openProjectManager() },
      ],
      dismissible: false,
    });
  }
}
```

Non-dismissible, and the primary action is the one that preserves the work. A toast
would be dismissed and the operator would keep working into a void.

Pre-empt it: when total usage exceeds 70% of `navigator.storage.estimate().quota`,
show a passive warning in the project manager listing exported projects that can be
deleted.

---

## 3. Save status indicator

Status bar, always visible:

| State | Display |
|---|---|
| `saved`, recent | `Tersimpan 14:32` |
| `saving` | `Menyimpan…` |
| `error` | `⛔ Gagal menyimpan` — click opens the dialog |
| Never exported | `Tersimpan 14:32 · belum diekspor` in amber |

The `belum diekspor` suffix is the quiet, persistent version of the message from
§5. It costs nothing and it is present during the hours when the operator is
building the file, rather than only at the end.

---

## 4. Schema migration

```ts
const CURRENT_SCHEMA = '1.0.0';

type Migration = (data: any) => any;

const MIGRATIONS: Record<string, { to: string; migrate: Migration }> = {
  // '1.0.0': { to: '1.1.0', migrate: d => ({ ...d, nodes: d.nodes.map(addNewField) }) },
};

function migrate(raw: any): any {
  let data = raw;
  let guard = 0;
  while (data.schemaVersion !== CURRENT_SCHEMA && guard++ < 20) {
    const step = MIGRATIONS[data.schemaVersion];
    if (!step) throw new UnsupportedSchemaError(data.schemaVersion);
    data = { ...step.migrate(data), schemaVersion: step.to };
  }
  return data;
}
```

Empty at MVP, and that is the point — the mechanism ships before it is needed,
because the alternative is inventing it under pressure when real operator files
already exist in a format that can't be read.

**Version newer than the app's.** An operator on a stale cached build opens a file
from a newer version. Do not attempt to read it:

```ts
if (semverGt(raw.schemaVersion, CURRENT_SCHEMA)) {
  throw new NewerSchemaError(
    `Berkas dibuat dengan aplikasi versi lebih baru (${raw.schemaVersion}). ` +
    `Muat ulang halaman untuk memperbarui aplikasi.`);
}
```

This is why the app version sits in the status bar and why the reload instruction
appears in the error. Cached-build confusion is otherwise indistinguishable from
file corruption, and generates support requests nobody can diagnose.

`configVersion` is separate and never blocks — handled per doc 02 §5.

---

## 5. Export reminder

The one behavior that mitigates the tool's biggest structural risk.

```ts
function shouldRemindExport(entry: ProjectIndexEntry): boolean {
  if (!entry.lastExportedAt) return entry.nodeCount >= 10;
  const hoursSince = (Date.now() - Date.parse(entry.lastExportedAt)) / 36e5;
  return hoursSince > 4 && entry.updatedAt > entry.lastExportedAt;
}
```

Triggers on: session end intent, project switch, and once per hour of active
editing.

```
┌───────────────────────────────────────────────┐
│ Pekerjaan ini baru tersimpan di browser       │
│                                               │
│ Penyimpanan browser terikat pada komputer     │
│ dan browser ini. Data hilang bila cache       │
│ dibersihkan atau Anda berpindah komputer.     │
│                                               │
│ 47 node · terakhir diekspor: belum pernah     │
│                                               │
│  [Nanti]              [Ekspor JSON sekarang]  │
└───────────────────────────────────────────────┘
```

The wording states the mechanism, not just the risk. An operator who understands
*why* browser storage is fragile will export unprompted; one who has only been
nagged will click Nanti.

The 10-node threshold avoids nagging someone who just opened the app. Snooze is
remembered per project for the session.

---

## 6. Project manager

```
┌─ PROJECT ─────────────────────────────────────────────┐
│ [+ Baru]  [↥ Impor JSON]  [↥ Impor Excel]             │
├───────────────────────────────────────────────────────┤
│ ● Dinas Kesehatan            89 node   Keb 248        │
│   DINKES · diubah 14:32 · diekspor 11:20              │
│                                    [Duplikat] [Hapus] │
│                                                       │
│ ○ Dinas Pendidikan          142 node   Keb 391        │
│   DISDIK · diubah kemarin · belum diekspor ⚠          │
│                                    [Duplikat] [Hapus] │
├───────────────────────────────────────────────────────┤
│ Penyimpanan browser: 2,1 MB dari ±5 MB                │
└───────────────────────────────────────────────────────┘
```

```ts
createProject(meta?: Partial<ProjectMeta>): string
duplicateProject(id: string): string          // '— Salinan' appended, resets lastExportedAt
deleteProject(id: string): void               // confirms; extra confirm if never exported
switchProject(id: string): void               // flushes save, clears history
renameProject(id: string, meta: Partial<ProjectMeta>): void
```

`switchProject` clears history — cross-document undo is meaningless (doc 03 §2).
The switch confirms if the outgoing project has unexported changes.

Deleting a never-exported project requires typing the agency name. That is
deliberately heavier than a normal confirm, because it is the one irreversible
destructive action in the application and there is no recycle bin.

The storage meter is not decoration: it is the only warning an operator gets before
quota exhaustion, and it makes the deletion suggestion in §2 comprehensible.

---

## 7. Startup sequence

```ts
async function bootstrap() {
  const index = await readIndex();                   // async; tolerant: rebuild if corrupt
  if (!index.activeId) return showEmptyState();

  try {
    const raw = await storage.getProject(index.activeId);   // idb-keyval get()
    if (!raw) throw new Error('Project body not found in storage');

    const project = zProject.parse(migrate(raw));
    projectStore.load(project);

    const findings = validateProject(project, taxonomy);
    if (project.configVersion !== taxonomy.configVersion) showConfigVersionBanner(project);
    if (findings.some(f => f.severity === 'error')) showFindingsBadge(findings);

    fitAll();
  } catch (err) {
    showRecoveryDialog(index.activeId, err);
  }
}
```

### Corrupt project body

```ts
async function showRecoveryDialog(id: string, err: unknown) {
  // The raw value is fetched BEFORE anything is overwritten.
  // storage.getRaw() returns the unparsed value for forensics.
  const raw = await storage.getRaw(projectKey(id));
  const rawStr = raw != null ? JSON.stringify(raw, null, 2) : '';
  dialog.open({
    title: 'Project tidak dapat dibuka',
    body: 'Data project rusak atau dibuat oleh versi aplikasi lain. '
        + 'Unduh salinan mentahnya untuk diperiksa, lalu buka project lain.',
    actions: [
      { label: 'Unduh data mentah', onClick: () => downloadText(rawStr, `rusak_${id}.json`) },
      { label: 'Buka project lain', primary: true, onClick: openProjectManager },
    ],
  });
}
```

The raw download matters. A corrupt body is usually recoverable by hand — a
truncated write, a single bad character — and destroying it to get back to a clean
state would throw away work that could have been salvaged. Nothing overwrites the
key until the operator has had the chance to take a copy.

### Corrupt index

Rebuild by iterating over all IndexedDB keys matching `pjb:v1:project:*` (via
`storage.listProjectKeys()`) and reading only `meta` and counts from each body.
The index is derivable; project bodies are not. This asymmetry is why they are
stored separately.

---

## 8. Edge cases

**Two tabs, same project.** IndexedDB does not fire cross-tab events natively.
Use `BroadcastChannel` to ping every tab on each save, and warn on receipt:

```ts
const bc = new BroadcastChannel('pjb');

// Sender — in scheduleSave, after each successful write:
bc.postMessage({ type: 'saved', projectId: project.id, ts: Date.now() });

// Receiver — in every tab:
bc.addEventListener('message', (e: MessageEvent) => {
  if (e.data.type === 'saved' && e.data.projectId === activeProjectId()) {
    // Another tab just wrote this project.
    ui.setSaveStatus('error');
    dialog.open({
      title: 'Project ini dibuka di tab lain',
      body: 'Perubahan dari tab ini bisa saling menimpa. Tutup salah satu tab.',
      dismissible: false,
    });
  }
});
```

Full multi-tab coordination (a distributed lock) is V1. Detection and a blocking
warning is the MVP-appropriate answer — cheap, and prevents silent loss.

**Private browsing.** IndexedDB in private mode is sandboxed and evaporates on
window close. Detect at startup by attempting a probe write to IndexedDB. If it
fails or if `navigator.storage.estimate()` reports near-zero quota, show a
persistent banner: work will not survive closing the window, export frequently.

**Storage disabled entirely.** The app must still run, in memory, with a permanent
banner. Refusing to start would be worse than running unsaved with a clear warning.

**Clock skew.** `updatedAt` from a machine with a wrong clock can appear older than
`lastExportedAt`, defeating the reminder. Compare using a monotonic counter
alongside timestamps for reminder logic; display the timestamps.

**Project exceeding 50 MB alone.** Far outside the design target (500 nodes ≈
200–400 KB). Warn on save above 2 MB that the file is beyond the supported size.
The 50 MB quota applies to the whole origin, not one project.

---

## 9. Exit criteria

- [ ] Autosave debounced at 500 ms, triggered from `commit` only
- [ ] Flush on `visibilitychange` and `beforeunload`
- [ ] `beforeunload` prompt fires only with unexported changes
- [ ] Quota error (IndexedDB `QuotaExceededError`) shows a non-dismissible dialog with export as primary action
- [ ] Storage meter reads from `navigator.storage.estimate()` and displays in the project manager
- [ ] Passive quota warning shown when usage exceeds 70% of estimated quota
- [ ] Save indicator shows `belum diekspor` until first export
- [ ] Export reminder respects the 10-node threshold and per-session snooze
- [ ] Project switch flushes save, clears history, confirms unexported changes
- [ ] Deleting a never-exported project requires typing the agency name
- [ ] Index rebuildable by scanning IndexedDB project keys after deliberate index corruption
- [ ] Corrupt project body offers raw download before anything is overwritten
- [ ] Newer `schemaVersion` blocks with a reload instruction, not a parse attempt
- [ ] `migrate()` mechanism present and unit-tested with a synthetic migration
- [ ] Second tab on the same project produces a blocking warning (via `BroadcastChannel`)
- [ ] Private browsing detected via IndexedDB probe write, banner shown
- [ ] App runs with storage disabled, banner shown
- [ ] `navigator.storage.persist()` requested on first save; persistent storage denial handled gracefully
