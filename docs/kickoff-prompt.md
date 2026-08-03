# Kickoff Prompt

Paste into Claude Code, Cursor, or similar. Assumes the `peta-jabatan-docs/`
folder is in the repo root.

---

## The prompt

```
I'm building "Peta Jabatan Builder" — a frontend-only React app for composing
the organizational structure and staffing figures of a single Indonesian local
government agency (OPD). Full specifications are in `peta-jabatan-docs/`.

## Before writing any code

Read these three documents completely, in order:
- `peta-jabatan-docs/README.md` — index and cross-cutting invariants
- `peta-jabatan-docs/00-product-brief.md` — scope and product decisions
- `peta-jabatan-docs/01-architecture-data-model.md` — the type system

Then read `12-implementation-sequence.md` for build order. The other documents
are per-module blueprints; read each one when you reach its milestone, not
before.

The docs are the specification. Where the docs and your instincts disagree,
follow the docs and tell me why you disagree — several decisions in there are
deliberate reversals of the obvious choice, and each has a stated rationale.
If a doc is genuinely ambiguous or self-contradicting, stop and ask rather
than picking one reading and continuing.

## Scope for this session

Milestones M0 and M1 only. Do not start M2 (canvas).

**M0 — Scaffold**
Vite + React 18 + TypeScript (strict), Tailwind, Vitest, ESLint + Prettier,
path aliases. Directory structure per `00-product-brief.md` §18. App version
injected at build time. Shell layout per `11-ui-shell-components.md` §1 with
placeholder panels — layout only, no functionality.

**M1 — Data model and state, headless**
Per `01-architecture-data-model.md` and `03-state-history.md`:
- All type definitions in `models/`
- Zod schemas in `schema/`, including the migration mechanism (empty at MVP)
- `StructureIndex` and the full selector layer
- Zustand stores: project, history, ui
- `commit()` with Immer `produceWithPatches`
- History with transaction coalescing, 50-step ceiling
- All project actions listed in `03-state-history.md` §3
- Numbering utilities from `01-architecture-data-model.md` §7

**M1b — Configuration** (parallel with M1)
Per `02-configuration-taxonomy.md`: `taxonomy.json`, the resolver API, and the
label-to-id maps.

## How to work

Build M1 **headless and test-first**. No UI beyond the M0 placeholder shell.
This layer is where a subtle bug is invisible in the interface and corrupts
data silently — a patch-ordering mistake surfaces three undos later, which
manual testing does not find.

Write the tests from the exit criteria at the end of each document. Those
criteria are the acceptance spec; treat them as the test plan rather than
writing your own from scratch.

Work in small commits, one concern each. After each significant piece, tell me
what you built and what the tests cover before continuing.

## Constraints you must not violate

These are stated in `README.md` and enforced across the codebase:

1. Unit nodes never store figures — `rincian` is always `[]` for
   `type === 'unit'`. Their numbers are computed aggregates.
2. Position never implies hierarchy. Dragging changes `position` only;
   parentage lives in edges. No code may infer hierarchy from coordinates.
3. `selisih` is computed, never stored — `eksisting − kebutuhan`.
4. Nothing mutates project state outside `commit()`. History depends on it.
5. Every consumer of edges filters by `kind === 'hirarki'` via the
   `hierarchyEdges()` helper — never by comparing the field inline.
6. Cycles are prevented at the interaction layer (`canSetParent`), not
   detected afterward.

## Things to get right that are easy to get wrong

- Inverse patches accumulate in **reverse** order within a coalesced
  transaction. Test this specifically.
- `compareNomor` is segment-wise numeric, not lexical. `1.10` sorts after
  `1.9`.
- The structure index must not rebuild on position-only changes. Instrument
  the rebuild count in a test.
- Domain terms stay in Indonesian (`nama`, `nomor`, `kebutuhan`, `eksisting`,
  `rincian`, `jenjang`, `kategori`, `rumpun`). Structural code is English.
  Don't translate the domain vocabulary — it maps to regulatory terms.

## Out of scope entirely

No backend, no auth, no multi-user, no network calls. The app must run fully
offline. Storage is IndexedDB behind a thin async wrapper (see the amendment at
the top of doc 10) — build M5 on it directly; do not build on LocalStorage
first. Do NOT implement the Stage B features (link nodes, dashboard,
template-instance — docs 13–15) yet, but DO include their optional fields
(`link`, `isTemplate`, `instances`) in the M1 type definitions and Zod schemas
exactly as doc 01 defines them, so Stage A files never need migration.

## Deliverable for this session

A repo where `pnpm test` passes, every exit criterion in
`01-architecture-data-model.md` §9, `02-configuration-taxonomy.md` §9, and
`03-state-history.md` §6 is covered by a test, and the shell renders.

Start by reading the docs and giving me your implementation plan for M0 and M1
before you write code. Flag anything in the specs you think is wrong.
```

---

## Follow-up prompts

Once M1 is green, continue one milestone at a time:

```
M1 is complete and tests pass. Read `peta-jabatan-docs/05-canvas-layout.md` and
implement M2.

Before moving to M3, generate a 500-node fixture and verify pan, zoom, and drag
hold frame rate. This is a hard gate — a performance problem found here is a
memoization fix, but found later it means rewriting everything built on top.

Report the frame timings before you continue.
```

```
M2 passes the performance gate. Read `06-property-panel-rincian.md` and
implement M3. Pay particular attention to the chip picker in §2 — it resolves
the design question the whole data model was shaped around, so get the
interaction exactly as specified before optimizing anything about it.
```

Subsequent milestones follow the same shape: name the doc, name the milestone,
name the one thing most likely to go wrong.

---

## Notes on using this

**Keep the docs in the repo**, not pasted into chat. The agent should read them
as files so it can re-read a section when it reaches the relevant milestone
rather than working from a summary that drifts.

**Resist letting it run ahead.** The strong temptation with a spec this detailed
is to hand the agent everything and let it build the whole MVP in one pass. The
result compiles and looks right, and the invariant violations surface weeks
later as recap figures that disagree with the diagram. Milestone by milestone,
with tests, is slower for two days and faster overall.

**The "flag anything you think is wrong" instruction is not politeness.** Several
decisions in the docs are counterintuitive — export before import, ids instead
of labels, patches instead of snapshots, non-blocking validation. An agent that
silently disagrees will drift toward the conventional choice somewhere in the
implementation. Surfacing the disagreement is how you catch it in the plan
rather than in the code.
