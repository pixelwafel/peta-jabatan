import { Project } from '@/models/project';
import { OrgNode, Rincian } from '@/models/node';
import { Recap, NodeTotals } from '@/models/derived';
import { Taxonomy, taxonomy } from '@/config/taxonomy';
import { getStructureIndex } from '@/selectors/structureIndex';
import { getJenjangOptions } from '@/config/resolver';
import { compareNomor } from '@/utils/numbering';
import { RowContext } from './columnSpec';

const ZERO: NodeTotals = { kebutuhan: 0, eksisting: 0, selisih: 0 };

function sortRincian(node: OrgNode): Rincian[] {
  const options = getJenjangOptions(node.kategoriId, node.rumpun);
  const order = new Map(options.map((j, i) => [j.id, i]));
  return [...node.rincian].sort(
    (a, b) => (order.get(a.jenjangId ?? '') ?? 99) - (order.get(b.jenjangId ?? '') ?? 99)
  );
}

export function buildExportRows(
  project: Project,
  recap: Recap,
  cfg: Taxonomy = taxonomy
): RowContext[] {
  const idx = getStructureIndex(project.nodes, project.edges);

  const byNomorThenTree = (a: OrgNode, b: OrgNode) => {
    if (a.nomor && b.nomor) return compareNomor(a.nomor, b.nomor);
    if (a.nomor) return -1;
    if (b.nomor) return 1;
    return a.id.localeCompare(b.id);
  };

  const orderedNodes = [...project.nodes].sort(byNomorThenTree);

  return orderedNodes.flatMap(node => {
    const parentId = idx.parentId.get(node.id);
    const parent = parentId ? idx.nodeById.get(parentId) ?? null : null;

    if (node.type === 'unit') {
      return [
        {
          node,
          rincian: null,
          parent,
          totals: recap.subtreeTotals.get(node.id) ?? ZERO,
          cfg,
        },
      ];
    }

    if (node.rincian.length === 0) {
      // Emit an empty row rather than dropping the node — preserves position on re-import
      return [
        {
          node,
          rincian: null,
          parent,
          totals: ZERO,
          cfg,
        },
      ];
    }

    return sortRincian(node).map(r => ({
      node,
      rincian: r,
      parent,
      totals: recap.nodeTotals.get(node.id) ?? ZERO,
      cfg,
    }));
  });
}
