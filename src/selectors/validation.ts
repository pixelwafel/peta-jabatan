import { Project } from '@/models/project';
import { OrgNode } from '@/models/node';
import { Finding } from '@/models/derived';
import { Taxonomy, taxonomy } from '@/config/taxonomy';
import { getStructureIndex } from './structureIndex';
import { designatedRoot } from './navigation';
import { isJenjangValid, jenjangLabel, getJenjangOptions } from '@/config/resolver';

export interface ReadinessReport {
  ready: boolean; // no errors — warnings do not block
  groups: Array<{
    code: string;
    severity: 'error' | 'warning' | 'info';
    count: number;
    title: string;
    items: Finding[];
  }>;
  summary: { errors: number; warnings: number; infos: number };
}

export function validateProject(
  project: Project,
  cfg: Taxonomy = taxonomy
): Finding[] {
  const f: Finding[] = [];
  const idx = getStructureIndex(project.nodes, project.edges);
  const roots = project.nodes.filter(n => !idx.parentId.has(n.id));
  const root = designatedRoot(project.nodes, project.edges);

  // 1. Meta checks
  if (!project.meta.namaOPD?.trim() || !project.meta.kodeOPD?.trim()) {
    f.push({
      code: 'META_OPD_MISSING',
      severity: 'error',
      message: 'Nama dan kode OPD belum diisi.',
    });
  }

  // 2. Root checks
  if (roots.length === 0 && project.nodes.length > 0) {
    f.push({
      code: 'NODE_NO_ROOT',
      severity: 'error',
      message:
        'Tidak ada node puncak. Struktur kemungkinan mengandung relasi melingkar.',
    });
  } else if (roots.length > 1) {
    f.push({
      code: 'NODE_MULTIPLE_ROOTS',
      severity: 'warning',
      message: `${roots.length} node tidak memiliki atasan. Satu menjadi puncak, ${
        roots.length - 1
      } lainnya belum ditempatkan.`,
    });
  }

  // 3. Groupings for duplicate nomor and kode
  const byNomor = new Map<string, OrgNode[]>();
  for (const n of project.nodes) {
    if (n.nomor) {
      const list = byNomor.get(n.nomor) ?? [];
      list.push(n);
      byNomor.set(n.nomor, list);
    }
  }

  const byKode = new Map<string, OrgNode[]>();
  for (const n of project.nodes) {
    if (n.kode) {
      const list = byKode.get(n.kode) ?? [];
      list.push(n);
      byKode.set(n.kode, list);
    }
  }

  for (const [nomor, group] of byNomor.entries()) {
    if (group.length > 1) {
      f.push({
        code: 'NODE_NOMOR_DUPLICATE',
        severity: 'warning',
        nodeId: group[0].id,
        message: `Nomor ${nomor} dipakai oleh ${group.length} node.`,
      });
    }
  }

  for (const [kode, group] of byKode.entries()) {
    if (group.length > 1) {
      f.push({
        code: 'NODE_KODE_DUPLICATE',
        severity: 'warning',
        nodeId: group[0].id,
        message: `Kode ${kode} dipakai oleh ${group.length} node.`,
      });
    }
  }

  // 4. Node-level checks
  for (const n of project.nodes) {
    if (!n.nama.trim()) {
      f.push({
        code: 'NODE_NAMA_EMPTY',
        severity: 'error',
        nodeId: n.id,
        message: 'Nama node belum diisi.',
      });
    }

    if (!n.nomor) {
      f.push({
        code: 'NODE_NOMOR_EMPTY',
        severity: 'info',
        nodeId: n.id,
        message: `"${n.nama}" belum memiliki nomor hirarki.`,
      });
    }

    if (root && n.id !== root.id && !idx.parentId.has(n.id)) {
      f.push({
        code: 'NODE_NO_PARENT',
        severity: 'warning',
        nodeId: n.id,
        message: `"${n.nama}" belum ditempatkan di bawah unit mana pun.`,
      });
    }

    if (n.type === 'unit') {
      if (n.rincian.length > 0) {
        f.push({
          code: 'UNIT_HAS_RINCIAN',
          severity: 'error',
          nodeId: n.id,
          message: `Node unit "${n.nama}" tidak boleh memiliki angka sendiri.`,
        });
      }

      // Unit head checks (Invariant: 1 structural head per unit)
      const childrenIds = idx.childIds.get(n.id) ?? [];
      const children = childrenIds
        .map(cid => idx.nodeById.get(cid))
        .filter(Boolean) as OrgNode[];

      const structuralHeads = children.filter(c => c.kategoriId === 'struktural');
      if (children.length > 0 && structuralHeads.length === 0) {
        f.push({
          code: 'UNIT_TANPA_KEPALA',
          severity: 'warning',
          nodeId: n.id,
          message: `Unit "${n.nama}" belum memiliki kepala (jabatan struktural).`,
        });
      } else if (structuralHeads.length > 1) {
        f.push({
          code: 'UNIT_BANYAK_KEPALA',
          severity: 'warning',
          nodeId: n.id,
          message: `Unit "${n.nama}" memiliki ${structuralHeads.length} kepala (jabatan struktural).`,
        });
      }
    }

    if (n.type === 'jabatan') {
      if (!n.kategoriId) {
        f.push({
          code: 'NODE_KATEGORI_MISSING',
          severity: 'warning',
          nodeId: n.id,
          message: `Kategori jabatan "${n.nama}" belum dipilih.`,
        });
      }

      if (n.rincian.length === 0) {
        f.push({
          code: 'JABATAN_NO_RINCIAN',
          severity: 'warning',
          nodeId: n.id,
          message: `"${n.nama}" belum memiliki baris angka.`,
        });
      }

      const validOptions = getJenjangOptions(n.kategoriId, n.rumpun);
      const seenJenjang = new Set<string>();
      let allZero = n.rincian.length > 0;

      for (const r of n.rincian) {
        if (r.kebutuhan < 0 || r.eksisting < 0) {
          f.push({
            code: 'RINCIAN_NEGATIVE',
            severity: 'error',
            nodeId: n.id,
            message: `Angka pada "${n.nama}" tidak boleh negatif.`,
          });
        }

        if (r.kebutuhan !== 0 || r.eksisting !== 0) {
          allZero = false;
        } else {
          f.push({
            code: 'RINCIAN_ALL_ZERO',
            severity: 'info',
            nodeId: n.id,
            message: `Baris ${
              r.jenjangId ? jenjangLabel(r.jenjangId, n.kategoriId) : 'tanpa jenjang'
            } pada "${n.nama}" masih nol.`,
          });
        }

        if (r.jenjangId) {
          if (seenJenjang.has(r.jenjangId)) {
            f.push({
              code: 'JENJANG_DUPLICATE',
              severity: 'warning',
              nodeId: n.id,
              message: `Jenjang ${jenjangLabel(
                r.jenjangId,
                n.kategoriId
              )} tercatat dua kali pada "${n.nama}".`,
            });
          }
          seenJenjang.add(r.jenjangId);

          if (!isJenjangValid(n.kategoriId, n.rumpun, r.jenjangId)) {
            f.push({
              code: 'JENJANG_INVALID',
              severity: 'warning',
              nodeId: n.id,
              message: `Jenjang tidak sesuai kategori pada "${n.nama}".`,
            });
          }
        } else if (validOptions.length > 0) {
          f.push({
            code: 'JENJANG_MISSING',
            severity: 'warning',
            nodeId: n.id,
            message: `Baris pada "${n.nama}" belum diberi jenjang.`,
          });
        }
      }

      if (allZero && n.rincian.length > 0) {
        f.push({
          code: 'NODE_ALL_ZERO',
          severity: 'warning',
          nodeId: n.id,
          message: `"${n.nama}" seluruh angkanya masih nol.`,
        });
      }
    }

    // Check custom required attributes
    for (const a of project.attributeSchema.filter(a => a.wajib)) {
      const val = n.custom?.[a.id];
      if (val === undefined || val === null || String(val).trim() === '') {
        f.push({
          code: 'CUSTOM_REQUIRED_EMPTY',
          severity: 'warning',
          nodeId: n.id,
          field: a.id,
          message: `${a.nama} belum diisi pada "${n.nama}".`,
        });
      }
    }
  }

  return f;
}

export function buildReadinessReport(
  findings: Finding[]
): ReadinessReport {
  let errors = 0;
  let warnings = 0;
  let infos = 0;

  const groupMap = new Map<
    string,
    { code: string; severity: 'error' | 'warning' | 'info'; items: Finding[] }
  >();

  for (const f of findings) {
    if (f.severity === 'error') errors++;
    if (f.severity === 'warning') warnings++;
    if (f.severity === 'info') infos++;

    const g = groupMap.get(f.code) ?? {
      code: f.code,
      severity: f.severity,
      items: [],
    };
    g.items.push(f);
    groupMap.set(f.code, g);
  }

  const groups = Array.from(groupMap.values()).map(g => ({
    ...g,
    count: g.items.length,
    title: g.items[0]?.message ?? g.code,
  }));

  // Sort groups: errors first, then warnings, then infos; within severity by count descending
  const severityRank = { error: 0, warning: 1, info: 2 };
  groups.sort((a, b) => {
    if (severityRank[a.severity] !== severityRank[b.severity]) {
      return severityRank[a.severity] - severityRank[b.severity];
    }
    return b.count - a.count;
  });

  return {
    ready: errors === 0,
    groups,
    summary: { errors, warnings, infos },
  };
}
