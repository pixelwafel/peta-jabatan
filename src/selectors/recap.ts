import { useMemo } from 'react';
import { Project } from '@/models/project';
import { OrgNode } from '@/models/node';
import { NodeTotals, Recap, RecapBucket } from '@/models/derived';
import { taxonomy, Taxonomy, Kategori } from '@/config/taxonomy';
import { getKategori, jenjangLabel, getJenjangOptions } from '@/config/resolver';
import { getStructureIndex, StructureIndex } from './structureIndex';
import { designatedRoot, descendantsOf, depthOf } from './navigation';
import { compareNomor } from '@/utils/numbering';
import { useProjectStore } from '@/store/projectStore';

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

export function computeRecap(project: Project, cfg: Taxonomy = taxonomy): Recap {
  recapComputeCount++;

  const idx = getStructureIndex(project.nodes, project.edges);
  const nodeTotals = new Map<string, NodeTotals>();
  const subtreeTotals = new Map<string, NodeTotals>();

  // 1. Calculate own rows totals (Units carry only their kepalaUnit figures, if any)
  for (const n of project.nodes) {
    if (n.type === 'unit') {
      const keb = n.kepalaUnit?.kebutuhan ?? 0;
      const eks = n.kepalaUnit?.eksisting ?? 0;
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

  // 2. Post-order traversal with visited set to guard against cycles
  const visited = new Set<string>();
  const walk = (id: string): NodeTotals => {
    if (visited.has(id)) {
      return subtreeTotals.get(id) ?? ZERO;
    }
    visited.add(id);

    const own = nodeTotals.get(id) ?? ZERO;
    let keb = own.kebutuhan;
    let eks = own.eksisting;

    for (const cid of idx.childIds.get(id) ?? []) {
      const c = walk(cid);
      keb += c.kebutuhan;
      eks += c.eksisting;
    }

    const t = { kebutuhan: keb, eksisting: eks, selisih: eks - keb };
    subtreeTotals.set(id, t);
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
  const totalBucket: RecapBucket = {
    key: 'total',
    label: 'TOTAL OPD',
    ...rootTotal,
    nodeCount: countPositions(inScopeNodes),
  };

  // Unplaced Bucket
  const unplacedTotals = sumBuckets(orphans.map(o => subtreeTotals.get(o.id) ?? ZERO));
  const unplacedNodes = orphans.flatMap(o => [o, ...descendantsOf(project.nodes, project.edges, o.id)]);
  const unplacedBucket: RecapBucket = {
    key: 'unplaced',
    label: 'Belum Ditempatkan',
    ...unplacedTotals,
    nodeCount: countPositions(unplacedNodes),
  };

  // Per-Unit Breakdown
  const perUnit: RecapBucket[] = project.nodes
    .filter(n => n.type === 'unit')
    .sort((a, b) => compareNomor(a.nomor, b.nomor))
    .map(u => {
      const subNodes = [u, ...descendantsOf(project.nodes, project.edges, u.id)];
      const t = subtreeTotals.get(u.id) ?? ZERO;
      return {
        key: u.id,
        label: u.nama,
        ...t,
        nodeCount: countPositions(subNodes),
        depth: depthOf(project.nodes, project.edges, u.id),
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
    if (n.type === 'jabatan') {
      for (const r of n.rincian) {
        if (!r.jenjangId) continue;
        const b = jenjangAcc.get(r.jenjangId) ?? { keb: 0, eks: 0, n: 0 };
        b.keb += r.kebutuhan ?? 0;
        b.eks += r.eksisting ?? 0;
        b.n += 1;
        jenjangAcc.set(r.jenjangId, b);
      }
    } else if (n.type === 'unit' && n.kepalaUnit?.jenjangId) {
      const jid = n.kepalaUnit.jenjangId;
      const b = jenjangAcc.get(jid) ?? { keb: 0, eks: 0, n: 0 };
      b.keb += n.kepalaUnit.kebutuhan ?? 0;
      b.eks += n.kepalaUnit.eksisting ?? 0;
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
      return `${n.id}:${n.type}:${n.kategoriId ?? ''}:${n.rumpun.join(',')}:${n.rincian
        .map(r => `${r.jenjangId ?? ''},${r.kebutuhan},${r.eksisting}`)
        .join('|')}:${kepala}`;
    })
    .join(';');

export const structuralKey = (nodes: OrgNode[], edges: OrgEdge[]): string =>
  `${nodes.length}:${edges.length}:${nodes.map(n => n.id).join(',')}:${edges
    .map(e => `${e.source}->${e.target}`)
    .join(',')}`;

export const recapKey = (project: Project): string =>
  `${structuralKey(project.nodes, project.edges)}#${figuresKey(project.nodes)}`;

export function useRecap(): Recap | null {
  const project = useProjectStore(s => s.project);

  const memoKey = useMemo(() => {
    if (!project) return null;
    return recapKey(project);
  }, [project]);

  return useMemo(() => {
    if (!project) return null;
    return computeRecap(project, taxonomy);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memoKey]);
}
