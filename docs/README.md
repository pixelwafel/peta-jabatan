# Peta Jabatan Builder — Documentation Set

A frontend-only tool for building the position map (*peta jabatan*) of a single
local-government agency (OPD): visual structure on a free-form canvas, position
requirement/incumbent counts per role, live recapitulation, and XLSX/JSON
interchange.

> [!NOTE]
> **Archive Notice**: `product-brief-peta-jabatan-v2.md` is deprecated and preserved for historical reference only. Please refer to [`00-product-brief.md`](./00-product-brief.md) for current specifications.

## Document Index

| # | Document | Contents | Stage |
|---|---|---|---|
| 00 | [Product Brief](./00-product-brief.md) | Scope, users, decisions, definition of done | Core |
| 01 | [Architecture & Data Model](./01-architecture-data-model.md) | Type definitions, invariants, module boundaries | Core |
| 02 | [Configuration & Taxonomy](./02-configuration-taxonomy.md) | `taxonomy.json`, category/level resolution | Core |
| 03 | [State & History](./03-state-history.md) | Zustand store, patch-based undo/redo, coalescing | Core |
| 04 | [Hierarchy & Validation](./04-hierarchy-validation.md) | Tree derivation, cycle prevention, findings engine | Core |
| 05 | [Canvas & Layout](./05-canvas-layout.md) | React Flow wiring, node sizing, Dagre tidy | Core |
| 06 | [Property Panel & Detail Rows](./06-property-panel-rincian.md) | Attribute editing, JF level chip picker | Core |
| 07 | [Recap Engine](./07-recap-engine.md) | Bottom-up aggregation, breakdowns | Core |
| 08 | [Import Pipeline](./08-import-pipeline.md) | XLSX/JSON parsing, hierarchical numbering, preview | Core |
| 09 | [Export Pipeline](./09-export-pipeline.md) | Shared column spec, JSON/XLSX/CSV/PNG writers | Core |
| 10 | [Persistence & Projects](./10-persistence-projects.md) | IndexedDB layout, autosave, schema migration | Core |
| 11 | [UI Shell & Components](./11-ui-shell-components.md) | Layout, toolbar, sidebars, component contracts | Core |
| 12 | [Implementation Sequence](./12-implementation-sequence.md) | Milestones, dependency order, exit criteria | Core |
| 13 | [Link Nodes](./13-link-nodes.md) | Cross-file references, cached totals, staleness | Stage B |
| 14 | [Recap Dashboard & Bulk Import](./14-recap-dashboard.md) | Government-wide view, expected-agency list, batch import | Stage B |
| 15 | [Template-Instance Units](./15-template-instance.md) | School-type units: structure once, figures per instance | Stage B |
| 16 | [Error Handling & Recovery](./16-error-handling-recovery.md) | Fault tolerance, recovery dialogs, error boundaries | Core |
| 17 | [PWA & Offline](./17-pwa-offline.md) | Service Worker, manifest, offline resilience | Core |

## How to read this set

Documents 01–03 are foundational; everything else depends on them. Read them
first, in order. After that, 04–11 can be read in any order, though the build
order in document 12 is deliberate and not arbitrary.

Each module document follows the same structure: **Purpose → Public interface →
Algorithms → Edge cases → Exit criteria**. The "Public interface" section is the
contract other modules rely on; changing it means checking every consumer.

## Conventions used throughout

- Pseudocode is TypeScript-shaped but not compilable. Types are exact; function
  bodies are illustrative.
- **Domain terms stay in Indonesian** (`nama`, `nomor`, `kebutuhan`, `eksisting`,
  `rincian`, `jenjang`, `kategori`, `rumpun`) because they map to a regulatory
  vocabulary with no clean English equivalent, and mixing languages inside one
  identifier is worse than committing to one. Structural terms are English.
- `Finding` is the universal shape for anything reported to the user —
  validation, import parsing, readiness check. One shape, one renderer.
- Derived values are never stored. If a number can be computed from `rincian`,
  it is computed on read.

## Non-negotiable invariants

These are stated once here and enforced across modules. Violating any of them
produces bugs that look like plausible data.

1. **Unit nodes never store numbers.** `rincian` is always empty for
   `type === 'unit'`. Their figures are aggregates, computed.
2. **Position never implies hierarchy.** Dragging a node changes `position` only.
   Parentage lives in edges, and nothing derives it from coordinates.
3. **`selisih` is computed, never stored.** `eksisting − kebutuhan`.
4. **One root per project.** Enforced softly (warning), not by blocking input.
5. **JSON is the working format; XLSX is the data-interchange format.**
   Only JSON carries `position`, the attribute schema, and instances.
6. **Aggregates are not tree-only.** A unit's totals = descendant rows
   + linked-file cached totals + instance sums (doc 07 §2b is the one formula).
   No code may assume descendants-only aggregation.
7. **Detail rows inside a template subtree carry zero figures.** They are
   column definitions; real figures live only in `Project.instances`.
8. **Link graphs are acyclic**, enforced at link creation, and link nodes never
   have hierarchy children.
9. **Project bodies live in IndexedDB**, not LocalStorage. LocalStorage holds
   only UI preferences and acknowledgments.
