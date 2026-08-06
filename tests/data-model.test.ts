import { describe, it, expect } from 'vitest';
import { zNode } from '../src/schema/node';
import { zProject } from '../src/schema/project';
import { Project } from '../src/models/project';
import { hierarchyEdges } from '../src/utils/edges';
import { OrgEdge } from '../src/models/edge';

describe('Data Model & Invariants (Doc 01 Exit Criteria)', () => {
  it('Zod schema rejects unit nodes carrying rincian figures (Invariant 1)', () => {
    const invalidUnitNode = {
      id: 'unit-1',
      type: 'unit',
      nama: 'Dinas Kesehatan',
      nomor: '1',
      rumpun: [],
      rincian: [{ id: 'r-1', jenjangId: null, kebutuhan: 5, eksisting: 2 }],
      custom: {},
      position: { x: 0, y: 0 },
      collapsed: false,
    };

    const result = zNode.safeParse(invalidUnitNode);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('Node unit tidak boleh memiliki rincian angka');
    }
  });

  it('Zod schema accepts valid unit node with empty rincian', () => {
    const validUnitNode = {
      id: 'unit-1',
      type: 'unit',
      nama: 'Dinas Kesehatan',
      nomor: '1',
      rumpun: [],
      rincian: [],
      custom: {},
      position: { x: 0, y: 0 },
      collapsed: false,
    };

    expect(zNode.safeParse(validUnitNode).success).toBe(true);
  });

  it('Zod schema rejects project with duplicate node IDs (Invariant 9)', () => {
    const projectWithDuplicateId: Project = {
      id: 'proj-1',
      schemaVersion: '1.0.0',
      configVersion: '2026.1',
      meta: { namaOPD: 'Test OPD', kodeOPD: 'OPD.01', penyusun: 'Admin' },
      attributeSchema: [],
      nodes: [
        {
          id: 'dup-id',
          type: 'unit',
          nama: 'Unit A',
          nomor: '1',
          rumpun: [],
          rincian: [],
          custom: {},
          position: { x: 0, y: 0 },
          collapsed: false,
        },
        {
          id: 'dup-id',
          type: 'jabatan',
          nama: 'Jabatan B',
          nomor: '1.1',
          rumpun: [],
          rincian: [{ id: 'r-1', jenjangId: null, kebutuhan: 1, eksisting: 1 }],
          custom: {},
          position: { x: 10, y: 10 },
          collapsed: false,
        },
      ],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const result = zProject.safeParse(projectWithDuplicateId);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.message.includes('ID duplikat'))).toBe(true);
    }
  });

  it('Zod schema rejects project with dangling edges', () => {
    const projectWithDanglingEdge: Project = {
      id: 'proj-1',
      schemaVersion: '1.0.0',
      configVersion: '2026.1',
      meta: { namaOPD: 'Test OPD', kodeOPD: 'OPD.01', penyusun: 'Admin' },
      attributeSchema: [],
      nodes: [
        {
          id: 'n-1',
          type: 'unit',
          nama: 'Unit A',
          nomor: '1',
          rumpun: [],
          rincian: [],
          custom: {},
          position: { x: 0, y: 0 },
          collapsed: false,
        },
      ],
      edges: [
        {
          id: 'e-1',
          source: 'n-1',
          target: 'missing-node',
          kind: 'hirarki',
        },
      ],
      viewport: { x: 0, y: 0, zoom: 1 },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const result = zProject.safeParse(projectWithDanglingEdge);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.message.includes('Edge menunjuk node yang tidak ada'))).toBe(true);
    }
  });

  it('Zod schema preserves kepalaUnit, locked, and unitKerja through export->import JSON round-trip (Fase 1.9)', () => {
    // Sebelum Fase 1.9, zNode tidak mendeklarasikan kepalaUnit & locked —
    // Zod menanggalkan key tak dikenal secara default, jadi round-trip
    // export JSON -> import JSON diam-diam menghilangkan kepala unit
    // struktural dan status kunci node tanpa peringatan apa pun.
    const projectWithKepalaUnit: Project = {
      id: 'proj-kepala',
      schemaVersion: '1.0.0',
      configVersion: '2026.1',
      meta: { namaOPD: 'Test OPD', kodeOPD: 'OPD.01', penyusun: 'Admin' },
      attributeSchema: [],
      nodes: [
        {
          id: 'unit-1',
          type: 'unit',
          nama: 'Sekretariat',
          nomor: '1',
          rumpun: [],
          rincian: [],
          kepalaUnit: {
            nama: 'Sekretaris',
            kode: 'SEK.01',
            jenjangId: 'administrator',
            kebutuhan: 1,
            eksisting: 1,
          },
          unitKerja: 'Sekretariat Daerah',
          custom: {},
          position: { x: 0, y: 0 },
          collapsed: false,
          order: 0,
          locked: true,
        },
      ],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Simulasi persis jalur import/jsonImporter.ts: JSON.stringify (export) ->
    // JSON.parse -> zProject.safeParse (import).
    const roundTripped = JSON.parse(JSON.stringify(projectWithKepalaUnit));
    const result = zProject.safeParse(roundTripped);

    expect(result.success).toBe(true);
    if (result.success) {
      const node = result.data.nodes[0];
      expect(node.kepalaUnit).toEqual({
        nama: 'Sekretaris',
        kode: 'SEK.01',
        jenjangId: 'administrator',
        kebutuhan: 1,
        eksisting: 1,
      });
      expect(node.unitKerja).toBe('Sekretariat Daerah');
      expect(node.locked).toBe(true);
    }
  });

  it('hierarchyEdges() correctly filters only hierarchy edges (Invariant 5)', () => {
    const edges: OrgEdge[] = [
      { id: 'e1', source: 'n1', target: 'n2', kind: 'hirarki' },
      { id: 'e2', source: 'n1', target: 'n3', kind: 'koordinasi' },
      { id: 'e3', source: 'n2', target: 'n4', kind: 'pembinaan' },
    ];

    const filtered = hierarchyEdges(edges);
    expect(filtered.length).toBe(1);
    expect(filtered[0].id).toBe('e1');
  });
});
