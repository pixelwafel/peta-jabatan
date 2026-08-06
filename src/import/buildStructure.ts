import { OrgNode } from '@/models/node';
import { OrgEdge } from '@/models/edge';
import { Finding } from '@/models/derived';
import { NodeCandidate } from './groupRows';
import { compareNomor, parentNomor } from '@/utils/numbering';
import { uuid } from '@/utils/uuid';

function nearestExistingAncestor(
  missingParentNomor: string,
  byNomorMap: Map<string, NodeCandidate>
): NodeCandidate | null {
  let curr: string | null = missingParentNomor;
  while (curr !== null) {
    const p = parentNomor(curr);
    if (p !== null && byNomorMap.has(p)) {
      return byNomorMap.get(p)!;
    }
    curr = p;
  }
  return null;
}

export function buildStructure(candidates: NodeCandidate[]): {
  nodes: OrgNode[];
  edges: OrgEdge[];
  findings: Finding[];
} {
  const findings: Finding[] = [];
  const sorted = [...candidates].sort((a, b) => compareNomor(a.nomor, b.nomor));

  const byNomor = new Map(sorted.map(c => [c.nomor, c]));
  const idByNomor = new Map(sorted.map(c => [c.nomor, uuid()]));

  // sorted sudah terurut per-nomor (yang mencerminkan hierarki), jadi urutan
  // kemunculan di dalam grup parent yang sama = urutan sibling yang benar.
  const orderCounters = new Map<string, number>();
  const nodes: OrgNode[] = sorted.map(c => {
    const parentKey = parentNomor(c.nomor) ?? '__root__';
    const order = orderCounters.get(parentKey) ?? 0;
    orderCounters.set(parentKey, order + 1);

    return {
      id: idByNomor.get(c.nomor)!,
      type: c.tipe,
      nama: c.nama,
      nomor: c.nomor,
      kode: c.kode,
      kategoriId: c.kategoriId,
      rumpun: c.rumpun,
      rincian: c.rincian,
      unitKerja: c.unitKerja,
      keterangan: c.keterangan,
      kepalaUnit: c.kepalaUnit,
      link: c.link,
      custom: c.custom,
      position: { x: 0, y: 0 }, // Tidy assigns real coordinates on commit
      collapsed: false,
      order,
    };
  });

  const edges: OrgEdge[] = [];

  for (const c of sorted) {
    const pn = parentNomor(c.nomor);
    if (pn === null) continue; // Top-level root candidate

    if (!byNomor.has(pn)) {
      // Gap in numbering: 1.1.1 present but 1.1 absent! Walk up to nearest ancestor.
      const ancestor = nearestExistingAncestor(pn, byNomor);
      if (ancestor) {
        findings.push({
          code: 'IMPORT_PARENT_MISSING',
          severity: 'warning',
          rowNumber: c.rowNumbers[0],
          message: `Nomor ${pn} tidak ada. "${c.nama}" dipasang di bawah ${ancestor.nomor} (${ancestor.nama}).`,
        });
        edges.push({
          id: uuid(),
          source: idByNomor.get(ancestor.nomor)!,
          target: idByNomor.get(c.nomor)!,
          kind: 'hirarki',
        });
      } else {
        findings.push({
          code: 'IMPORT_PARENT_MISSING',
          severity: 'error',
          rowNumber: c.rowNumbers[0],
          message: `Nomor ${pn} tidak ada dan tidak ada induk pengganti. "${c.nama}" belum ditempatkan.`,
        });
      }
      continue;
    }

    edges.push({
      id: uuid(),
      source: idByNomor.get(pn)!,
      target: idByNomor.get(c.nomor)!,
      kind: 'hirarki',
    });
  }

  const roots = sorted.filter(c => parentNomor(c.nomor) === null);
  if (roots.length === 0 && sorted.length > 0) {
    findings.push({
      code: 'IMPORT_NO_ROOT',
      severity: 'error',
      message:
        'Tidak ada baris bernomor tingkat pertama (misal "1"). Struktur tidak memiliki puncak.',
    });
  } else if (roots.length > 1) {
    findings.push({
      code: 'IMPORT_MULTIPLE_ROOTS',
      severity: 'warning',
      message: `${roots.length} nomor tingkat pertama ditemukan (${roots
        .map(r => r.nomor)
        .join(', ')}).`,
    });
  }

  return { nodes, edges, findings };
}
