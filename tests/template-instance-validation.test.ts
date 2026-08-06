import { describe, it, expect } from 'vitest';
import { Project } from '../src/models/project';
import { OrgNode } from '../src/models/node';
import { OrgEdge } from '../src/models/edge';
import { UnitInstance } from '../src/models/project';
import { validateProject } from '../src/selectors/validation';
import { taxonomy } from '../src/config/taxonomy';

function baseFixture(overrides: {
  sekolahExtra?: Partial<OrgNode>;
  guruRincianExtra?: Partial<OrgNode['rincian'][number]>;
  extraNodes?: OrgNode[];
  extraEdges?: OrgEdge[];
  instances?: UnitInstance[];
}): Project {
  const nodes: OrgNode[] = [
    {
      id: 'root',
      type: 'unit',
      nama: 'Dinas Pendidikan',
      nomor: '1',
      rumpun: [],
      rincian: [],
      custom: {},
      position: { x: 0, y: 0 },
      collapsed: false,
      order: 0,
    },
    {
      id: 'sekolah',
      type: 'unit',
      nama: 'SD (Template)',
      nomor: '1.1',
      rumpun: [],
      rincian: [],
      custom: {},
      position: { x: 0, y: 100 },
      collapsed: false,
      order: 0,
      isTemplate: true,
      kepalaUnit: { jenjangId: 'jpt_pratama', kebutuhan: 0, eksisting: 0 },
      ...overrides.sekolahExtra,
    },
    {
      id: 'guru-kelas',
      type: 'jabatan',
      nama: 'Guru Kelas',
      nomor: '1.1.1',
      kategoriId: 'fungsional',
      rumpun: ['keahlian'],
      rincian: [
        { id: 'r1', jenjangId: 'ahli_pertama', kebutuhan: 0, eksisting: 0, ...overrides.guruRincianExtra },
      ],
      custom: {},
      position: { x: 0, y: 200 },
      collapsed: false,
      order: 0,
    },
    ...(overrides.extraNodes ?? []),
  ];
  const edges: OrgEdge[] = [
    { id: 'e1', source: 'root', target: 'sekolah', kind: 'hirarki' },
    { id: 'e2', source: 'sekolah', target: 'guru-kelas', kind: 'hirarki' },
    ...(overrides.extraEdges ?? []),
  ];

  return {
    id: 'proj-template-validation',
    schemaVersion: '1.0.0',
    configVersion: '2026.1',
    meta: { namaOPD: 'Dinas Pendidikan', kodeOPD: 'DISDIK', penyusun: 'Admin' },
    attributeSchema: [],
    nodes,
    edges,
    instances: overrides.instances,
    viewport: { x: 0, y: 0, zoom: 1 },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe('Template-instance validation (M12.4, docs/15-template-instance.md §5)', () => {
  it('TEMPLATE_ROW_HAS_FIGURES fires when a rincian row inside a template subtree carries non-zero figures', () => {
    const proj = baseFixture({ guruRincianExtra: { kebutuhan: 4, eksisting: 3 } });
    const findings = validateProject(proj, taxonomy);
    expect(findings.some(f => f.code === 'TEMPLATE_ROW_HAS_FIGURES' && f.nodeId === 'guru-kelas')).toBe(true);
  });

  it('TEMPLATE_ROW_HAS_FIGURES fires when the template unit\'s own kepalaUnit carries non-zero figures', () => {
    const proj = baseFixture({ sekolahExtra: { kepalaUnit: { jenjangId: 'jpt_pratama', kebutuhan: 1, eksisting: 1 } } });
    const findings = validateProject(proj, taxonomy);
    expect(findings.some(f => f.code === 'TEMPLATE_ROW_HAS_FIGURES' && f.nodeId === 'sekolah')).toBe(true);
  });

  it('a healthy zeroed template row produces no TEMPLATE_ROW_HAS_FIGURES/RINCIAN_ALL_ZERO noise', () => {
    const proj = baseFixture({});
    const findings = validateProject(proj, taxonomy);
    expect(findings.some(f => f.code === 'TEMPLATE_ROW_HAS_FIGURES')).toBe(false);
    // RINCIAN_ALL_ZERO tidak relevan di dalam template (selalu nol by invariant) — jangan jadi noise
    expect(findings.some(f => f.code === 'RINCIAN_ALL_ZERO' && f.nodeId === 'guru-kelas')).toBe(false);
  });

  it('TEMPLATE_NESTED fires when a template unit sits inside another template subtree', () => {
    const proj = baseFixture({
      extraNodes: [
        {
          id: 'nested-template',
          type: 'unit',
          nama: 'SD Kecil Bersarang',
          nomor: '1.1.2',
          rumpun: [],
          rincian: [],
          custom: {},
          position: { x: 0, y: 300 },
          collapsed: false,
          order: 1,
          isTemplate: true,
        },
      ],
      extraEdges: [{ id: 'e3', source: 'sekolah', target: 'nested-template', kind: 'hirarki' }],
    });
    const findings = validateProject(proj, taxonomy);
    expect(findings.some(f => f.code === 'TEMPLATE_NESTED' && f.nodeId === 'nested-template')).toBe(true);
  });

  it('TEMPLATE_LINK_CONFLICT fires when a node is both isTemplate and a link', () => {
    const proj = baseFixture({
      sekolahExtra: {
        link: { kodeOPD: 'X', namaProject: 'X', cached: { kebutuhan: 0, eksisting: 0, nodeCount: 0, updatedAt: '' } },
      },
    });
    const findings = validateProject(proj, taxonomy);
    expect(findings.some(f => f.code === 'TEMPLATE_LINK_CONFLICT' && f.nodeId === 'sekolah')).toBe(true);
  });

  it('TEMPLATE_NO_INSTANCES fires (warning) when a template unit has zero instances', () => {
    const proj = baseFixture({});
    const findings = validateProject(proj, taxonomy);
    const finding = findings.find(f => f.code === 'TEMPLATE_NO_INSTANCES' && f.nodeId === 'sekolah');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('warning');
  });

  it('TEMPLATE_NO_INSTANCES does not fire once at least one instance exists', () => {
    const proj = baseFixture({
      instances: [{ id: 'i1', templateNodeId: 'sekolah', nama: 'SDN 01', figures: {} }],
    });
    const findings = validateProject(proj, taxonomy);
    expect(findings.some(f => f.code === 'TEMPLATE_NO_INSTANCES')).toBe(false);
  });

  it('INSTANCE_ORPHAN_FIGURES fires (warning) for a figure keyed to a deleted rincianId, without dropping the data', () => {
    const proj = baseFixture({
      instances: [
        {
          id: 'i1',
          templateNodeId: 'sekolah',
          nama: 'SDN 01',
          figures: { r1: { kebutuhan: 4, eksisting: 3 }, 'r-terhapus': { kebutuhan: 9, eksisting: 9 } },
        },
      ],
    });
    const findings = validateProject(proj, taxonomy);
    const finding = findings.find(f => f.code === 'INSTANCE_ORPHAN_FIGURES');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('warning');
    // Data tetap ada di instance — validator cuma melapor, bukan menghapus.
    const instance = proj.instances!.find(i => i.id === 'i1')!;
    expect(instance.figures['r-terhapus']).toEqual({ kebutuhan: 9, eksisting: 9 });
  });

  it('INSTANCE_NAMA_DUPLICATE fires (warning) when two instances of the same template share a name', () => {
    const proj = baseFixture({
      instances: [
        { id: 'i1', templateNodeId: 'sekolah', nama: 'SDN 01', figures: { r1: { kebutuhan: 1, eksisting: 1 } } },
        { id: 'i2', templateNodeId: 'sekolah', nama: 'SDN 01', figures: { r1: { kebutuhan: 2, eksisting: 2 } } },
      ],
    });
    const findings = validateProject(proj, taxonomy);
    expect(findings.some(f => f.code === 'INSTANCE_NAMA_DUPLICATE')).toBe(true);
  });

  it('INSTANCE_ALL_ZERO fires (info) when every cell of an instance is zero', () => {
    const proj = baseFixture({
      instances: [{ id: 'i1', templateNodeId: 'sekolah', nama: 'SDN Kosong', figures: { r1: { kebutuhan: 0, eksisting: 0 } } }],
    });
    const findings = validateProject(proj, taxonomy);
    const finding = findings.find(f => f.code === 'INSTANCE_ALL_ZERO');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('info');
  });

  it('a fully healthy template + instance produces none of the TEMPLATE_*/INSTANCE_* findings except the expected ones', () => {
    const proj = baseFixture({
      instances: [{ id: 'i1', templateNodeId: 'sekolah', nama: 'SDN 01', figures: { r1: { kebutuhan: 4, eksisting: 3 } } }],
    });
    const findings = validateProject(proj, taxonomy);
    const templateCodes = findings.filter(f => f.code.startsWith('TEMPLATE_') || f.code.startsWith('INSTANCE_'));
    expect(templateCodes).toHaveLength(0);
  });
});
