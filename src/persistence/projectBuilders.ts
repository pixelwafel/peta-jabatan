import { Project } from '@/models/project';
import { ProjectIndex, ProjectIndexEntry, ProjectSummary } from './types';
import { hierarchyEdges } from '@/utils/edges';
import { compareNomor } from '@/utils/numbering';
import { mergeStrukturalHeadsIntoUnits } from '@/utils/structuralMerge';
import { Taxonomy, taxonomy } from '@/config/taxonomy';
import { getCachedValidation } from '@/selectors/validation';
import { getCachedRecap } from '@/selectors/recap';

/**
 * Fase 3.2 — fungsi MURNI seputar `Project` (bangun ringkasan/entry, migrasi
 * skema lama) dipisah dari persistence/storage.ts (yang sekarang isinya
 * delegasi ke `repository`, lihat persistence/repository.ts) supaya tidak ada
 * siklus impor: repository.ts butuh fungsi-fungsi ini, dan storage.ts
 * mengekspor repository.ts + fungsi-fungsi ini (re-export) untuk backward
 * compatibility caller lama (tests, workers/analysis.worker.ts,
 * persistence/bulkImport.ts, import/jsonImporter.ts — semuanya masih
 * `import { buildIndexEntry, ... } from '@/persistence/storage'`, TIDAK ada
 * yang perlu diubah untuk pindah ke sini).
 */

export const EMPTY_PROJECT_INDEX: ProjectIndex = { version: 1, activeId: null, entries: [] };

/**
 * Fase 3.1 — satu tempat yang menjalankan validate+recap atas sebuah Project
 * dan membentuknya jadi `ProjectSummary`. `buildIndexEntry` (di bawah) sama-
 * sama bersumber dari sini alih-alih menghitung validate/recap sendiri-sendiri.
 */
export function buildProjectSummary(
  project: Project,
  cfg: Taxonomy = taxonomy,
  index: ProjectIndex = EMPTY_PROJECT_INDEX
): ProjectSummary {
  const findings = getCachedValidation(project, cfg, index);
  const findingCounts = {
    errors: findings.filter(f => f.severity === 'error').length,
    warnings: findings.filter(f => f.severity === 'warning').length,
  };

  const recap = getCachedRecap(project, cfg, index);

  return {
    schemaVersion: 2,
    computedFrom: project.updatedAt || new Date().toISOString(),
    total: recap.total,
    perKategori: recap.perKategori,
    perJenjang: recap.perJenjang,
    unplaced: recap.unplaced,
    nodeCount: project.nodes.filter(n => n.type === 'jabatan').length,
    findingCounts,
    linkedCodes: project.nodes.filter(n => n.link).map(n => n.link!.kodeOPD),
  };
}

/**
 * Bangun ProjectIndexEntry dari sebuah Project — dipakai baik oleh
 * `repository.ts` (satu project, incremental) maupun `rebuildIndexFromStorage`
 * (semua project, dari nol). Diekstrak jadi fungsi murni supaya bisa ditest
 * tanpa IndexedDB (lihat tests/persistence.test.ts).
 *
 * `index` (opsional): index project-project LAIN yang sudah ada, dipakai
 * untuk resolusi link node (docs/13 §2) supaya totalKebutuhan/totalEksisting
 * project ini SUDAH menyertakan kontribusi link-nya — inilah yang membuat
 * "government total = jumlah topLevel entries" di dashboard (doc 14 §2)
 * valid tanpa perlu membuka body project lain lagi di sana.
 *
 * Fase 3.1: tinggal memetik field dari `buildProjectSummary` —
 * `ProjectIndexEntry` adalah "irisan tipis" dari `ProjectSummary` ditambah
 * beberapa field yang tidak dihitung (nama/kode/carry).
 */
export function buildIndexEntry(
  project: Project,
  carry: Pick<ProjectIndexEntry, 'lastExportedAt' | 'origin'> = { lastExportedAt: null, origin: 'created' },
  index: ProjectIndex = EMPTY_PROJECT_INDEX
): ProjectIndexEntry {
  const summary = buildProjectSummary(project, taxonomy, index);

  return {
    id: project.id,
    namaOPD: project.meta.namaOPD || 'Tanpa Nama',
    kodeOPD: project.meta.kodeOPD || 'KODE',
    nodeCount: summary.nodeCount,
    totalKebutuhan: summary.total.kebutuhan,
    totalEksisting: summary.total.eksisting,
    updatedAt: summary.computedFrom,
    lastExportedAt: carry.lastExportedAt,
    origin: carry.origin,
    // Kode OPD dari tiap link node di project ini — dipakai cycle guard
    // (selectors/linkResolver.ts canCreateLink) buat walk rantai tautan tanpa
    // perlu buka body project lain. Lihat docs/13-link-nodes.md §2.
    linkedCodes: summary.linkedCodes,
    // Badge "N file bermasalah" di dashboard tanpa buka body (doc 14 §2).
    findingCounts: summary.findingCounts,
  };
}

/**
 * Fase 3.1 — `summary.computedFrom` harus SAMA PERSIS dengan `updatedAt`
 * project saat ini. `updatedAt` di sini datang dari `ProjectIndexEntry` yang
 * SUDAH ada di memori (bagian dari index yang sudah dimuat) — caller tidak
 * pernah perlu membuka body project cuma untuk mengecek kesegaran, itu akan
 * meniadakan tujuan summary ini.
 */
export function isProjectSummaryFresh(
  summary: ProjectSummary | null,
  currentUpdatedAt: string
): summary is ProjectSummary {
  return summary !== null && summary.computedFrom === currentUpdatedAt;
}

/**
 * Proyek lama tersimpan tanpa field `order` pada node (urutan sibling dulu
 * disimpulkan dari `position.x`). Migrasi sekali jalan: turunkan `order`
 * dari urutan lama supaya tampilan outline tidak berubah setelah upgrade.
 */
export function normalizeProject(project: Project): Project {
  return normalizeProjectDetailed(project).project;
}

/**
 * Sama seperti normalizeProject, tapi juga melaporkan apakah body dimigrasi
 * (order backfill dan/atau merge kepala struktural) selama pemuatan — dipakai
 * bootstrap.ts (Fase 1.1) supaya body yang berubah karena migrasi tetap
 * ditulis sekali, sementara body yang TIDAK berubah tidak memicu autosave
 * saat project cuma dibuka/dibaca.
 */
export function normalizeProjectDetailed(project: Project): { project: Project; migrated: boolean } {
  const headsResult = normalizeStrukturalHeads(project);
  project = headsResult.project;
  let migrated = headsResult.migrated;

  if (project.nodes.every(n => typeof n.order === 'number')) {
    return { project, migrated };
  }
  migrated = true;

  const parentIdByChild = new Map<string, string>();
  for (const e of hierarchyEdges(project.edges)) {
    parentIdByChild.set(e.target, e.source);
  }

  const childrenByParent = new Map<string, typeof project.nodes>();
  for (const n of project.nodes) {
    const parentId = parentIdByChild.get(n.id) ?? '__root__';
    const siblings = childrenByParent.get(parentId) ?? [];
    siblings.push(n);
    childrenByParent.set(parentId, siblings);
  }

  for (const siblings of childrenByParent.values()) {
    siblings.sort((a, b) => {
      const byX = a.position.x - b.position.x;
      if (byX !== 0) return byX;
      if (a.nomor && b.nomor) {
        const byNomor = compareNomor(a.nomor, b.nomor);
        if (byNomor !== 0) return byNomor;
      }
      return a.nama.localeCompare(b.nama, 'id');
    });
    siblings.forEach((n, index) => {
      n.order = index;
    });
  }

  return { project, migrated };
}

/**
 * Proyek lama menyimpan posisi struktural sebagai node Jabatan terpisah di
 * bawah unitnya. Migrasi sekali jalan (idempotent, no-op setelah proyek
 * sudah bermigrasi): lipat ke `unit.kepalaUnit`. Lihat utils/structuralMerge.ts.
 */
function normalizeStrukturalHeads(project: Project): { project: Project; migrated: boolean } {
  const result = mergeStrukturalHeadsIntoUnits(project.nodes, project.edges);
  if (result.mergedCount === 0) return { project, migrated: false };
  return { project: { ...project, nodes: result.nodes, edges: result.edges }, migrated: true };
}

/** Fase 3.2 — pilih `activeId` dari sekumpulan entry: paling baru diubah,
 * atau `null` kalau kosong. Diekstrak jadi fungsi murni (dipakai
 * `rebuildIndexFromStorage` di repository.ts) supaya bisa ditest tanpa
 * IndexedDB. */
export function pickMostRecentId(entries: ProjectIndexEntry[]): string | null {
  if (entries.length === 0) return null;
  return entries.reduce((latest, e) =>
    Date.parse(e.updatedAt) > Date.parse(latest.updatedAt) ? e : latest
  ).id;
}
