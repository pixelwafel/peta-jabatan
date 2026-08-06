import { Project } from '@/models/project';
import { OrgNode } from '@/models/node';
import { Finding } from '@/models/derived';
import { Taxonomy, taxonomy } from '@/config/taxonomy';
import { getStructureIndex } from './structureIndex';
import { designatedRoot } from './navigation';
import { isJenjangValid, jenjangLabel, getJenjangOptions } from '@/config/resolver';
import { resolveLink, canCreateLink } from './linkResolver';
import { ProjectIndex } from '@/persistence/types';
import { buildTemplateUnitIds, containingTemplateUnitId, countInstancesFor } from './templateInstance';

const EMPTY_INDEX: ProjectIndex = { version: 1, activeId: null, entries: [] };
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// Fase 0.2 — counter untuk assertion performa berbasis panggilan, bukan ms.
// Lihat getRecapComputeCount di selectors/recap.ts untuk pola yang sama.
let validateCount = 0;

export function getValidateCount(): number {
  return validateCount;
}

export function resetValidateCount(): void {
  validateCount = 0;
}

// Fase 1.2 — sama seperti getCachedRecap di selectors/recap.ts: WeakMap
// keyed di identitas `project` (referensi baru per commit lewat
// produceWithPatches), jadi Toolbar (badge jumlah masalah, tiap render) dan
// ReadinessDialog (dialog "Cek Kesiapan") berbagi satu hasil validasi kalau
// keduanya membaca project yang sama dalam window waktu yang sama, alih-alih
// masing-masing menjalankan validateProject penuh sendiri-sendiri.
interface ValidationCacheEntry {
  cfg: Taxonomy;
  index: ProjectIndex;
  findings: Finding[];
}
const validationCache = new WeakMap<Project, ValidationCacheEntry>();

export function getCachedValidation(
  project: Project,
  cfg: Taxonomy = taxonomy,
  index: ProjectIndex = EMPTY_INDEX
): Finding[] {
  const cached = validationCache.get(project);
  if (cached && cached.cfg === cfg && cached.index === index) {
    return cached.findings;
  }
  const findings = validateProject(project, cfg, index);
  validationCache.set(project, { cfg, index, findings });
  return findings;
}

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
  cfg: Taxonomy = taxonomy,
  index: ProjectIndex = EMPTY_INDEX
): Finding[] {
  validateCount++;
  const f: Finding[] = [];
  const idx = getStructureIndex(project.nodes, project.edges);
  const roots = project.nodes.filter(n => !idx.parentId.has(n.id));
  const root = designatedRoot(project.nodes, project.edges);
  const templateUnitIds = buildTemplateUnitIds(project.nodes);

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
    // Template-instance (docs/15-template-instance.md §5) — dihitung sekali
    // per node, dipakai beberapa cek di bawah.
    const templateId = containingTemplateUnitId(n.id, idx, templateUnitIds);

    if (n.isTemplate) {
      if (n.link) {
        f.push({
          code: 'TEMPLATE_LINK_CONFLICT',
          severity: 'error',
          nodeId: n.id,
          message: `"${n.nama}" tidak boleh jadi template DAN tautan sekaligus.`,
        });
      }

      // Nested: ada leluhur (bukan dirinya sendiri) yang juga template.
      let ancestor = idx.parentId.get(n.id);
      const seenAncestors = new Set<string>();
      while (ancestor) {
        if (seenAncestors.has(ancestor)) break;
        seenAncestors.add(ancestor);
        if (templateUnitIds.has(ancestor)) {
          f.push({
            code: 'TEMPLATE_NESTED',
            severity: 'error',
            nodeId: n.id,
            message: `"${n.nama}" adalah template di dalam subtree template lain — template tidak boleh bersarang.`,
          });
          break;
        }
        ancestor = idx.parentId.get(ancestor);
      }

      if (countInstancesFor(project.instances ?? [], n.id) === 0) {
        f.push({
          code: 'TEMPLATE_NO_INSTANCES',
          severity: 'warning',
          nodeId: n.id,
          message: `Template "${n.nama}" belum punya satuan (instance) sama sekali.`,
        });
      }
    }

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

      // Unit head check: kepala unit sekarang melekat langsung di node Unit
      // (bukan node Jabatan terpisah) — lihat models/node.ts KepalaUnit.
      const childrenIds = idx.childIds.get(n.id) ?? [];
      const hasChildren = childrenIds.length > 0;

      if (hasChildren && !n.kepalaUnit) {
        f.push({
          code: 'UNIT_TANPA_KEPALA',
          severity: 'warning',
          nodeId: n.id,
          message: `Unit "${n.nama}" belum memiliki kepala (posisi struktural).`,
        });
      }

      if (n.kepalaUnit) {
        if (n.kepalaUnit.kebutuhan < 0 || n.kepalaUnit.eksisting < 0) {
          f.push({
            code: 'RINCIAN_NEGATIVE',
            severity: 'error',
            nodeId: n.id,
            message: `Angka kepala unit pada "${n.nama}" tidak boleh negatif.`,
          });
        }

        if (templateId && (n.kepalaUnit.kebutuhan !== 0 || n.kepalaUnit.eksisting !== 0)) {
          f.push({
            code: 'TEMPLATE_ROW_HAS_FIGURES',
            severity: 'error',
            nodeId: n.id,
            message: `Kepala unit "${n.nama}" di dalam subtree template harus nol — angka sebenarnya ada di satuan (instance), bukan di baris ini.`,
          });
        }

        if (!n.kepalaUnit.jenjangId) {
          f.push({
            code: 'JENJANG_MISSING',
            severity: 'warning',
            nodeId: n.id,
            message: `Jenjang kepala unit pada "${n.nama}" belum dipilih.`,
          });
        } else if (!isJenjangValid('struktural', [], n.kepalaUnit.jenjangId)) {
          f.push({
            code: 'JENJANG_INVALID',
            severity: 'warning',
            nodeId: n.id,
            message: `Jenjang kepala unit pada "${n.nama}" tidak valid.`,
          });
        }
      }

      // Link node checks (docs/13-link-nodes.md §7)
      if (n.link) {
        if (hasChildren) {
          f.push({
            code: 'LINK_HAS_CHILDREN',
            severity: 'error',
            nodeId: n.id,
            message: `"${n.nama}" adalah tautan tapi punya children — state korup, link & children saling eksklusif.`,
          });
        }

        const resolved = resolveLink(n.link, index);

        if (resolved.status === 'unresolved') {
          f.push({
            code: 'LINK_UNRESOLVED',
            severity: 'warning',
            nodeId: n.id,
            message: `Tautan "${n.nama}" (kode ${n.link.kodeOPD}) belum pernah diimpor di browser ini — angkanya belum tersedia.`,
          });
        }

        if (
          resolved.status === 'cached' &&
          resolved.asOf &&
          Date.now() - Date.parse(resolved.asOf) > THIRTY_DAYS_MS
        ) {
          f.push({
            code: 'LINK_STALE',
            severity: 'info',
            nodeId: n.id,
            message: `Angka tautan "${n.nama}" berasal dari cache per ${new Date(resolved.asOf).toLocaleDateString('id-ID')}, lebih dari 30 hari lalu.`,
          });
        }

        const matchingEntries = index.entries.filter(e => e.kodeOPD === n.link!.kodeOPD);
        if (matchingEntries.length > 1) {
          f.push({
            code: 'LINK_AMBIGUOUS',
            severity: 'info',
            nodeId: n.id,
            message: `Kode ${n.link.kodeOPD} dipakai oleh ${matchingEntries.length} project tersimpan — tautan "${n.nama}" mengambil yang paling baru diperbarui.`,
          });
        }

        if (!canCreateLink(index, project.meta.kodeOPD, n.link.kodeOPD)) {
          f.push({
            code: 'LINK_CYCLE',
            severity: 'error',
            nodeId: n.id,
            message: `Tautan "${n.nama}" (kode ${n.link.kodeOPD}) membentuk siklus — project tujuan balik menautkan ke project ini.`,
          });
        }
      }
    }

    // Node Jabatan berkategori struktural adalah peninggalan format lama
    // (belum sempat digabung otomatis ke unit induknya — lihat utils/structuralMerge.ts).
    if (n.type === 'jabatan' && n.kategoriId === 'struktural') {
      f.push({
        code: 'JABATAN_STRUKTURAL_DEPRECATED',
        severity: 'warning',
        nodeId: n.id,
        message: `"${n.nama}" adalah jabatan struktural sebagai node terpisah (format lama). Pindahkan datanya ke bagian "Kepala Unit" pada properti unit induk, lalu hapus node ini.`,
      });
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

        if (templateId) {
          // Di dalam template, baris HARUS nol (invariant) — RINCIAN_ALL_ZERO/
          // NODE_ALL_ZERO di sini cuma noise; TEMPLATE_ROW_HAS_FIGURES adalah
          // sinyal yang benar (baris ini seharusnya nol, tapi ternyata tidak).
          allZero = false;
          if (r.kebutuhan !== 0 || r.eksisting !== 0) {
            f.push({
              code: 'TEMPLATE_ROW_HAS_FIGURES',
              severity: 'error',
              nodeId: n.id,
              message: `Baris ${
                r.jenjangId ? jenjangLabel(r.jenjangId, n.kategoriId) : 'tanpa jenjang'
              } pada "${n.nama}" (di dalam template) harus nol — angka sebenarnya ada di satuan (instance).`,
            });
          }
        } else if (r.kebutuhan !== 0 || r.eksisting !== 0) {
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

  // 5. Instance checks (docs/15-template-instance.md §5) — kolom valid per
  // template = rincianId semua jabatan + id unit ber-kepalaUnit di dalam
  // subtree-nya (sama seperti store/projectStore.ts purgeInstanceColumns).
  const validColumnsByTemplate = new Map<string, Set<string>>();
  for (const templateId of templateUnitIds) {
    const cols = new Set<string>();
    for (const n of project.nodes) {
      if (containingTemplateUnitId(n.id, idx, templateUnitIds) !== templateId) continue;
      if (n.type === 'unit' && n.kepalaUnit) cols.add(n.id);
      if (n.type === 'jabatan') for (const r of n.rincian) cols.add(r.id);
    }
    validColumnsByTemplate.set(templateId, cols);
  }

  const namaSeen = new Map<string, string[]>(); // `${templateNodeId}::${nama lower}` -> instance ids

  for (const inst of project.instances ?? []) {
    const validColumns = validColumnsByTemplate.get(inst.templateNodeId);

    for (const columnKey of Object.keys(inst.figures)) {
      if (validColumns && !validColumns.has(columnKey)) {
        f.push({
          code: 'INSTANCE_ORPHAN_FIGURES',
          severity: 'warning',
          field: inst.id,
          message: `Satuan "${inst.nama}" punya angka pada kolom yang sudah tidak ada lagi (kolom "${columnKey}") — data tidak dihapus, cuma tidak lagi terhubung ke posisi mana pun.`,
        });
      }
    }

    const allZero = Object.values(inst.figures).every(fig => fig.kebutuhan === 0 && fig.eksisting === 0);
    if (allZero) {
      f.push({
        code: 'INSTANCE_ALL_ZERO',
        severity: 'info',
        field: inst.id,
        message: `Satuan "${inst.nama}" seluruh angkanya masih nol.`,
      });
    }

    const dupKey = `${inst.templateNodeId}::${inst.nama.trim().toLowerCase()}`;
    const list = namaSeen.get(dupKey) ?? [];
    list.push(inst.id);
    namaSeen.set(dupKey, list);
  }

  for (const ids of namaSeen.values()) {
    if (ids.length > 1) {
      const first = (project.instances ?? []).find(i => i.id === ids[0])!;
      f.push({
        code: 'INSTANCE_NAMA_DUPLICATE',
        severity: 'warning',
        field: first.id,
        message: `Nama "${first.nama}" dipakai oleh ${ids.length} satuan pada template yang sama.`,
      });
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
