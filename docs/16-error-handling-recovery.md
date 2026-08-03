# 16 — Error Handling & Recovery

## Purpose

Define a comprehensive error handling, fault tolerance, and data recovery strategy for the frontend application. In a frontend-only desktop/web application dealing with complex government organizational structures, runtime failures must never silently lose data or lock the operator out.

---

## 1. Error Classification & Strategy

| Error Category | Examples | Handling Strategy | User Experience |
|---|---|---|---|
| **Storage Faults** | IndexedDB quota exceeded, disk read failure, private browsing blocking | Catch at storage adapter layer; fallback to in-memory store; prompt export | Non-dismissible modal with immediate JSON download option |
| **Data Corruption** | Invalid JSON on import, schema mismatch, corrupt IDB project body | Intercept in `bootstrap()` or `importXlsx/Json()`; parse raw strings | Recovery dialog offering raw data download before overwrite |
| **Validation Errors** | Circular hierarchy, missing parent unit, invalid level code | Non-blocking background evaluation via `validateProject` | Red/amber badges in findings panel and node UI; non-fatal |
| **Render/UI Exceptions** | Canvas node crash, React rendering crash in property panel | React `ErrorBoundary` at module boundaries (Canvas, Panel, Dialog) | Isolated fallbacks with "Reload Component" or "Reset View" |
| **Export/Import Failure** | Worker memory limit, malformed Excel structure | Try-catch in file reader/writer pipelines | Toast notification with detailed diagnostic message |

---

## 2. Global Error Boundary & Component Isolation

React `ErrorBoundary` components are placed at strategic UI boundaries:

```tsx
<AppShell>
  <Header />
  <Sidebar>
    <ErrorBoundary name="RecapPanel" fallback={<RecapErrorFallback />}>
      <RecapPanel />
    </ErrorBoundary>
  </Sidebar>
  <MainViewport>
    <ErrorBoundary name="CanvasViewport" fallback={<CanvasErrorFallback />}>
      <CanvasViewport />
    </ErrorBoundary>
    <ErrorBoundary name="PropertyPanel" fallback={<PanelErrorFallback />}>
      <PropertyPanel />
    </ErrorBoundary>
  </MainViewport>
</AppShell>
```

### Fallback Behavior
- **Canvas Error**: Canvas resets zoom/pan or falls back to standard tree list view without losing state.
- **Recap Error**: Panel displays "Gagal menghitung rekapitulasi" with a retry button while main editor remains functional.
- **Property Panel Error**: Deselects current node and logs state diff.

---

## 3. Storage & Migration Recovery

### Startup Recovery (`bootstrap`)
If loading `activeId` fails due to schema parse error or IDB read error:
1. Fetch raw value via `storage.getRaw(id)`.
2. Present `RecoveryDialog`:
   - Button 1: "Unduh data mentah (`rusak_<id>.json`)"
   - Button 2: "Buka project lain"
3. Rebuild index if `pjb:v1:index` is corrupted by scanning all `pjb:v1:project:*` keys.

---

## 4. Unhandled Exception & Diagnostics Logger

An in-memory log queue (`uiLogger`) records the last 50 system errors and warnings:

```ts
interface LogEntry {
  timestamp: string;
  level: 'error' | 'warn' | 'info';
  module: string;
  message: string;
  stack?: string;
}
```

The system log can be downloaded via **Bantuan > Unduh Log Diagnostik** for troubleshooting.

---

## 5. Exit Criteria

- [ ] All major UI modules wrapped in `ErrorBoundary`
- [ ] Storage quota errors open non-dismissible export modal
- [ ] Corrupt project data permits raw file download before user switches projects
- [ ] In-memory diagnostic logs retain up to 50 items for export
