import { Project } from '@/models/project';
import { OrgNode } from '@/models/node';
import { OrgEdge } from '@/models/edge';
import { NodeTotals, Recap, RecapBucket } from '@/models/derived';
import { taxonomy, Taxonomy, Kategori } from '@/config/taxonomy';
import { getKategori, jenjangLabel, getJenjangOptions } from '@/config/resolver';
import { getStructureIndex, StructureIndex } from './structureIndex';
import { designatedRoot, allDepths } from './navigation';
import { compareNomor } from '@/utils/numbering';
import { resolveLink } from './linkResolver';
import { ProjectIndex } from '@/persistence/types';
import { buildTemplateUnitIds, containingTemplateUnitId, computeInstanceTotals, countInstancesFor } from './templateInstance';

export const EMPTY_INDEX: ProjectIndex = { version: 1, activeId: null, entries: [] };

let recapComputeCount = 0;

export function getRecapComputeCount(): number {
  return recapComputeCount;
}

export function resetRecapComputeCount(): void {
  recapComputeCount = 0;
}

const ZERO: NodeTotals = { kebutuhan: 0, eksisting: 0, selisih: 0 };

function countPositions(nodes: OrgNode[]): number {
  return nodes.filter(n => n.type === 'jabatan' || (n.type === 'unit' && n.kepalaUnit)).length;
}

function subtreeIds(rootId: string, idx: StructureIndex): Set<string> {
  const set = new Set<string>();
  const walk = (id: string) => {
    set.add(id);
    for (const c of idx.childIds.get(id) ?? []) {
      if (!set.has(c)) walk(c);
    }
  };
  walk(rootId);
  return set;
}

function sumBuckets(buckets: NodeTotals[]): NodeTotals {
  let keb = 0, eks = 0;
  for (const b of buckets) {
    keb += b.kebutuhan;
    eks += b.eksisting;
  }
  return { kebutuhan: keb, eksisting: eks, selisih: eks - keb };
}

function allJenjangOfCategory(k: Kategori) {
  if (!k.punyaRumpun) return k.jenjang ?? [];
  return [...(k.rumpun?.keahlian ?? []), ...(k.rumpun?.keterampilan ?? [])];
}

export function computeRecap(
  project: Project,
  cfg: Taxonomy = taxonomy,
  index: ProjectIndex = EMPTY_INDEX
): Recap {
  recapComputeCount++;

  const idx = getStructureIndex(project.nodes, project.edges);
  const nodeTotals = new Map<string, NodeTotals>();
  const subtreeTotals = new Map<string, NodeTotals>();
  // Freshness marker per node (docs/13-link-nodes.md §3): apakah subtree-nya
  // menyertakan angka link yang bukan 'live', dan tanggal cache tertua di
  // antaranya — dipakai buat jam kecil di recap panel.
  const cacheMarkers = new Map<string, { includesCached: boolean; oldestAsOf?: string }>();

  // Template-instance (docs/15-template-instance.md §3): angka nyata untuk
  // node di dalam subtree template datang dari Project.instances (kolom
  // rincianId, atau id unit-nya sendiri untuk kolom kepala unit — lihat
  // selectors/templateInstance.ts), BUKAN dari rincian/kepalaUnit tersimpan
  // (yang selalu nol lewat invariant TEMPLATE_ROW_HAS_FIGURES).
  const templateUnitIds = buildTemplateUnitIds(project.nodes);
  const instanceTotalsByTemplate = new Map<string, Map<string, NodeTotals>>();
  for (const templateId of templateUnitIds) {
    instanceTotalsByTemplate.set(templateId, computeInstanceTotals(project.instances ?? [], templateId));
  }

  // 1. Calculate own rows totals (Units carry only their kepalaUnit figures, if any)
  for (const n of project.nodes) {
    const templateId = containingTemplateUnitId(n.id, idx, templateUnitIds);
    const columnTotals = templateId ? instanceTotalsByTemplate.get(templateId) : undefined;

    if (n.type === 'unit') {
      if (columnTotals) {
        // Kolom "kepala unit" template dikunci pakai id unit-nya sendiri
        // (lihat catatan adaptasi di templateInstance.ts).
        nodeTotals.set(n.id, n.kepalaUnit ? columnTotals.get(n.id) ?? ZERO : ZERO);
      } else {
        const keb = n.kepalaUnit?.kebutuhan ?? 0;
        const eks = n.kepalaUnit?.eksisting ?? 0;
        nodeTotals.set(n.id, { kebutuhan: keb, eksisting: eks, selisih: eks - keb });
      }
    } else if (columnTotals) {
      let keb = 0, eks = 0;
      for (const r of n.rincian) {
        const t = columnTotals.get(r.id) ?? ZERO;
        keb += t.kebutuhan;
        eks += t.eksisting;
      }
      nodeTotals.set(n.id, { kebutuhan: keb, eksisting: eks, selisih: eks - keb });
    } else {
      let keb = 0, eks = 0;
      for (const r of n.rincian) {
        keb += r.kebutuhan ?? 0;
        eks += r.eksisting ?? 0;
      }
      nodeTotals.set(n.id, { kebutuhan: keb, eksisting: eks, selisih: eks - keb });
    }
  }

  // 2. Post-order traversal with visited set to guard against cycles.
  // Fase 1.4: subtreePositionCount diakumulasi di pass yang SAMA ini — dulu
  // dihitung ulang lewat descendantsOf(...) per unit & per orphan di bawah
  // (masing-masing O(subtree), dijumlah atas semua unit jadi O(N²) di
  // project besar). Nilainya sama persis dengan countPositions([node,
  // ...descendantsOf(node)]) yang digantikannya.
  const visited = new Set<string>();
  const subtreePositionCount = new Map<string, number>();
  const walk = (id: string): NodeTotals => {
    if (visited.has(id)) {
      return subtreeTotals.get(id) ?? ZERO;
    }
    visited.add(id);

    const node = idx.nodeById.get(id);
    const own = nodeTotals.get(id) ?? ZERO;
    let keb = own.kebutuhan;
    let eks = own.eksisting;
    let includesCached = false;
    let oldestAsOf: string | undefined;
    let positionCount =
      node && (node.type === 'jabatan' || (node.type === 'unit' && node.kepalaUnit)) ? 1 : 0;

    // Link node child: tambahkan totalnya lewat resolusi index, bukan lewat
    // rekursi hirarki (link tidak punya children beneran — doc 13 §1).
    if (node?.link) {
      const resolved = resolveLink(node.link, index);
      keb += resolved.totals.kebutuhan;
      eks += resolved.totals.eksisting;
      if (resolved.status !== 'live') {
        includesCached = true;
        oldestAsOf = resolved.asOf || undefined;
      }
    }

    for (const cid of idx.childIds.get(id) ?? []) {
      const c = walk(cid);
      keb += c.kebutuhan;
      eks += c.eksisting;
      positionCount += subtreePositionCount.get(cid) ?? 0;

      const childMarker = cacheMarkers.get(cid);
      if (childMarker?.includesCached) {
        includesCached = true;
        if (childMarker.oldestAsOf && (!oldestAsOf || childMarker.oldestAsOf < oldestAsOf)) {
          oldestAsOf = childMarker.oldestAsOf;
        }
      }
    }

    const t = { kebutuhan: keb, eksisting: eks, selisih: eks - keb };
    subtreeTotals.set(id, t);
    subtreePositionCount.set(id, positionCount);
    cacheMarkers.set(id, { includesCached, oldestAsOf });
    return t;
  };

  const root = designatedRoot(project.nodes, project.edges);
  const rootInIdx = root ? idx.parentId.has(root.id) : false;
  const orphans = project.nodes.filter(n => !idx.parentId.has(n.id) && n.id !== root?.id);

  const rootTotal = root ? walk(root.id) : ZERO;

  // Walk orphan subtrees to populate their maps as well
  for (const o of orphans) {
    walk(o.id);
  }

  const inScopeIds = root ? subtreeIds(root.id, idx) : new Set<string>();
  const inScopeNodes = project.nodes.filter(n => inScopeIds.has(n.id));

  // Whole Agency Total
  const rootMarker = root ? cacheMarkers.get(root.id) : undefined;
  const totalBucket: RecapBucket = {
    key: 'total',
    label: 'TOTAL OPD',
    ...rootTotal,
    nodeCount: countPositions(inScopeNodes),
    includesCached: rootMarker?.includesCached,
    oldestCachedAsOf: rootMarker?.oldestAsOf,
  };

  // Unplaced Bucket
  const unplacedTotals = sumBuckets(orphans.map(o => subtreeTotals.get(o.id) ?? ZERO));
  const unplacedPositionCount = orphans.reduce(
    (sum, o) => sum + (subtreePositionCount.get(o.id) ?? 0),
    0
  );
  const unplacedMarkers = orphans.map(o => cacheMarkers.get(o.id)).filter((m): m is { includesCached: boolean; oldestAsOf?: string } => !!m);
  const unplacedBucket: RecapBucket = {
    key: 'unplaced',
    label: 'Belum Ditempatkan',
    ...unplacedTotals,
    nodeCount: unplacedPositionCount,
    includesCached: unplacedMarkers.some(m => m.includesCached) || undefined,
    oldestCachedAsOf: unplacedMarkers
      .map(m => m.oldestAsOf)
      .filter((d): d is string => !!d)
      .sort()[0],
  };

  // Per-Unit Breakdown. Fase 1.4: nodeCount & depth datang dari
  // subtreePositionCount/depths yang sudah dihitung sekali di atas (O(N)
  // total), bukan descendantsOf/depthOf dipanggil per unit (O(N²)).
  const depths = allDepths(project.nodes, project.edges);
  const perUnit: RecapBucket[] = project.nodes
    .filter(n => n.type === 'unit')
    .sort((a, b) => compareNomor(a.nomor, b.nomor))
    .map(u => {
      const t = subtreeTotals.get(u.id) ?? ZERO;
      const marker = cacheMarkers.get(u.id);
      return {
        key: u.id,
        label: u.nama,
        ...t,
        // Unit template: nodeCount berarti "N satuan" (jumlah instance), bukan
        // jumlah posisi — posisi di dalamnya cuma definisi kolom (doc 15 §3).
        nodeCount: u.isTemplate
          ? countInstancesFor(project.instances ?? [], u.id)
          : subtreePositionCount.get(u.id) ?? 0,
        isTemplateUnit: u.isTemplate || undefined,
        depth: depths.get(u.id) ?? 0,
        includesCached: marker?.includesCached,
        oldestCachedAsOf: marker?.oldestAsOf,
      };
    });

  // Per-Category Breakdown (counts own rows of inScope position nodes only)
  const catAcc = new Map<string, { keb: number; eks: number; n: number }>();
  for (const k of cfg.kategori) {
    catAcc.set(k.id, { keb: 0, eks: 0, n: 0 });
  }
  catAcc.set('__tanpa_kategori__', { keb: 0, eks: 0, n: 0 });

  for (const n of inScopeNodes) {
    if (n.type === 'jabatan') {
      const key = n.kategoriId && catAcc.has(n.kategoriId) ? n.kategoriId : '__tanpa_kategori__';
      const t = nodeTotals.get(n.id) ?? ZERO;
      const b = catAcc.get(key)!;
      b.keb += t.kebutuhan;
      b.eks += t.eksisting;
      b.n += 1;
    } else if (n.type === 'unit' && n.kepalaUnit) {
      // Kepala unit selalu berkategori struktural (tersirat, lihat KepalaUnit)
      const t = nodeTotals.get(n.id) ?? ZERO;
      const b = catAcc.get('struktural') ?? catAcc.get('__tanpa_kategori__')!;
      b.keb += t.kebutuhan;
      b.eks += t.eksisting;
      b.n += 1;
    }
  }

  const perKategori: RecapBucket[] = Array.from(catAcc.entries())
    .map(([key, b]) => ({
      key,
      label: key === '__tanpa_kategori__' ? 'Belum berkategori' : getKategori(key)?.nama ?? key,
      kebutuhan: b.keb,
      eksisting: b.eks,
      selisih: b.eks - b.keb,
      nodeCount: b.n,
    }))
    .filter(b => b.nodeCount > 0 || b.key !== '__tanpa_kategori__');

  // Per-Jenjang Breakdown (functional levels in scope)
  const jenjangAcc = new Map<string, { keb: number; eks: number; n: number }>();

  for (const n of inScopeNodes) {
    const templateId = containingTemplateUnitId(n.id, idx, templateUnitIds);
    const columnTotals = templateId ? instanceTotalsByTemplate.get(templateId) : undefined;

    if (n.type === 'jabatan') {
      for (const r of n.rincian) {
        if (!r.jenjangId) continue;
        // Di dalam template, angka baris ini SELALU nol (invariant) — angka
        // sebenarnya per level datang dari kolom instance keyed rincian.id
        // (docs/15-template-instance.md §3), bukan r.kebutuhan/r.eksisting.
        const figure = columnTotals ? columnTotals.get(r.id) ?? ZERO : { kebutuhan: r.kebutuhan ?? 0, eksisting: r.eksisting ?? 0, selisih: 0 };
        const b = jenjangAcc.get(r.jenjangId) ?? { keb: 0, eks: 0, n: 0 };
        b.keb += figure.kebutuhan;
        b.eks += figure.eksisting;
        b.n += 1;
        jenjangAcc.set(r.jenjangId, b);
      }
    } else if (n.type === 'unit' && n.kepalaUnit?.jenjangId) {
      const jid = n.kepalaUnit.jenjangId;
      const t = nodeTotals.get(n.id) ?? ZERO; // sudah instance-aware lewat langkah 1
      const b = jenjangAcc.get(jid) ?? { keb: 0, eks: 0, n: 0 };
      b.keb += t.kebutuhan;
      b.eks += t.eksisting;
      b.n += 1;
      jenjangAcc.set(jid, b);
    }
  }

  // Sort jenjang by config order across categories
  const configJenjangOrder: string[] = [];
  for (const cat of cfg.kategori) {
    for (const j of allJenjangOfCategory(cat)) {
      configJenjangOrder.push(j.id);
    }
  }
  const orderMap = new Map(configJenjangOrder.map((id, i) => [id, i]));

  const perJenjang: RecapBucket[] = Array.from(jenjangAcc.entries())
    .sort((a, b) => (orderMap.get(a[0]) ?? 99) - (orderMap.get(b[0]) ?? 99))
    .map(([id, b]) => ({
      key: id,
      label: jenjangLabel(id),
      kebutuhan: b.keb,
      eksisting: b.eks,
      selisih: b.eks - b.keb,
      nodeCount: b.n,
    }));

  return {
    total: totalBucket,
    perUnit,
    perKategori,
    perJenjang,
    unplaced: unplacedBucket,
    nodeTotals,
    subtreeTotals,
  };
}

// Fase 1.2 — memo berbasis referensi. `produceWithPatches` (projectStore.ts
// commit) SELALU menghasilkan objek Project baru per commit, dan referensi
// yang sama itu dibagikan ke semua consumer dalam satu render pass. WeakMap
// keyed di `project` jadi cache sempurna: tanpa bangun string, tanpa
// invalidasi manual, entry lama ikut ter-GC begitu project-nya sendiri lepas
// dari memori. Ini menggantikan recapKey (di bawah, tetap diekspor untuk
// backward-compat test) di jalur useRecap/buildIndexEntry/Toolbar — akibatnya
// tiga useRecap() independen (Canvas, RecapPanel, ExportDialog) yang dulu
// masing-masing recompute sendiri sekarang berbagi satu hasil per project+
// index+cfg yang sama.
interface RecapCacheEntry {
  cfg: Taxonomy;
  index: ProjectIndex;
  recap: Recap;
}
const recapCache = new WeakMap<Project, RecapCacheEntry>();

export function getCachedRecap(
  project: Project,
  cfg: Taxonomy = taxonomy,
  index: ProjectIndex = EMPTY_INDEX
): Recap {
  const cached = recapCache.get(project);
  if (cached && cached.cfg === cfg && cached.index === index) {
    return cached.recap;
  }
  const recap = computeRecap(project, cfg, index);
  recapCache.set(project, { cfg, index, recap });
  return recap;
}

/**
 * Key for memoizing recap calculation.
 * Excludes position, nama, keterangan, and custom attributes.
 */
export const figuresKey = (nodes: OrgNode[]): string =>
  nodes
    .map(n => {
      const kepala = n.kepalaUnit
        ? `${n.kepalaUnit.jenjangId ?? ''},${n.kepalaUnit.kebutuhan},${n.kepalaUnit.eksisting}`
        : '';
      // kodeOPD + cache ikut di key: makeLink/unlinkNode/refresh cache tidak
      // mengubah nodes.length atau edges (link tak punya hierarchy child),
      // jadi structuralKey saja tidak cukup memicu recompute.
      const link = n.link
        ? `${n.link.kodeOPD},${n.link.cached.kebutuhan},${n.link.cached.eksisting},${n.link.cached.updatedAt}`
        : '';
      return `${n.id}:${n.type}:${n.kategoriId ?? ''}:${n.rumpun.join(',')}:${n.rincian
        .map(r => `${r.jenjangId ?? ''},${r.kebutuhan},${r.eksisting}`)
        .join('|')}:${kepala}:${link}`;
    })
    .join(';');

export const structuralKey = (nodes: OrgNode[], edges: OrgEdge[]): string =>
  `${nodes.length}:${edges.length}:${nodes.map(n => n.id).join(',')}:${edges
    .map(e => `${e.source}->${e.target}`)
    .join(',')}`;

export const recapKey = (project: Project): string =>
  `${structuralKey(project.nodes, project.edges)}#${figuresKey(project.nodes)}`;
