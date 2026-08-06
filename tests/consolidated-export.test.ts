import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { buildConsolidatedWorkbook, prefixNomor } from '../src/export/consolidatedExporter';
import { Project } from '../src/models/project';
import { OrgNode } from '../src/models/node';
import { ProjectIndex, ProjectIndexEntry } from '../src/persistence/types';

describe('prefixNomor (M11.6, docs/13-link-nodes.md §6)', () => {
  it('prefixes as documented: link 1.4 + target 1.1 -> 1.4.1.1', () => {
    expect(prefixNomor('1.4', '1.1')).toBe('1.4.1.1');
  });

  it('falls back to the non-empty side when either nomor is missing', () => {
    expect(prefixNomor('1.4', '')).toBe('1.4');
    expect(prefixNomor('', '1.1')).toBe('1.1');
  });
});

function makeProject(id: string, kodeOPD: string, extraNodes: OrgNode[] = [], edges: Project['edges'] = []): Project {
  const root: OrgNode = {
    id: `${id}-root`,
    type: 'unit',
    nama: kodeOPD,
    nomor: '1',
    rumpun: [],
    rincian: [],
    custom: {},
    position: { x: 0, y: 0 },
    collapsed: false,
    order: 0,
  };
  return {
    id,
    schemaVersion: '1.0.0',
    configVersion: '2026.1',
    meta: { namaOPD: kodeOPD, kodeOPD, penyusun: 'Admin' },
    attributeSchema: [],
    nodes: [root, ...extraNodes],
    edges,
    viewport: { x: 0, y: 0, zoom: 1 },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe('buildConsolidatedWorkbook (M11.6, docs/14-recap-dashboard.md §5)', () => {
  it('produces one sheet per top-level project plus a government recap sheet, and excludes linked children from being their own top-level sheet placement order', async () => {
    const linkNode: OrgNode = {
      id: 'dinkes-link',
      type: 'unit',
      nama: 'Puskesmas Kota Timur',
      nomor: '1.4',
      rumpun: [],
      rincian: [],
      custom: {},
      position: { x: 0, y: 0 },
      collapsed: false,
      order: 0,
      link: {
        kodeOPD: 'PKM1',
        namaProject: 'Puskesmas Kota Timur',
        cached: { kebutuhan: 0, eksisting: 0, nodeCount: 0, updatedAt: '' },
      },
    };
    const dinkes = makeProject('dinkes-id', 'DINKES', [linkNode], [
      { id: 'e1', source: 'dinkes-id-root', target: 'dinkes-link', kind: 'hirarki' },
    ]);
    const pkm1 = makeProject('pkm1-id', 'PKM1');

    const bodies = new Map<string, Project>([
      ['dinkes-id', dinkes],
      ['pkm1-id', pkm1],
    ]);
    const readProject = async (id: string) => bodies.get(id) ?? null;

    const index: ProjectIndex = {
      version: 1,
      activeId: null,
      entries: [
        entry('dinkes-id', 'DINKES', ['PKM1']),
        entry('pkm1-id', 'PKM1'),
      ],
    };

    const blob = await buildConsolidatedWorkbook(index, readProject);
    const buf = await blob.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });

    expect(wb.SheetNames).toContain('Rekap Pemerintah');
    expect(wb.SheetNames).toContain('DINKES');
    // Sheet anak dinamai gabungan parent_child
    expect(wb.SheetNames.some(n => n === 'DINKES_PKM1')).toBe(true);
    // PKM1 tidak muncul lagi sebagai sheet top-level terpisah bernama persis "PKM1"
    expect(wb.SheetNames).not.toContain('PKM1');
  });

  it('the linked child sheet carries link-prefixed nomor (1.4 + 1 -> 1.4.1)', async () => {
    const linkNode: OrgNode = {
      id: 'dinkes-link',
      type: 'unit',
      nama: 'Puskesmas Kota Timur',
      nomor: '1.4',
      rumpun: [],
      rincian: [],
      custom: {},
      position: { x: 0, y: 0 },
      collapsed: false,
      order: 0,
      link: {
        kodeOPD: 'PKM1',
        namaProject: 'Puskesmas Kota Timur',
        cached: { kebutuhan: 0, eksisting: 0, nodeCount: 0, updatedAt: '' },
      },
    };
    const dinkes = makeProject('dinkes-id', 'DINKES', [linkNode], [
      { id: 'e1', source: 'dinkes-id-root', target: 'dinkes-link', kind: 'hirarki' },
    ]);
    const pkm1 = makeProject('pkm1-id', 'PKM1'); // root node bernomor '1'

    const bodies = new Map<string, Project>([
      ['dinkes-id', dinkes],
      ['pkm1-id', pkm1],
    ]);
    const readProject = async (id: string) => bodies.get(id) ?? null;

    const index: ProjectIndex = {
      version: 1,
      activeId: null,
      entries: [entry('dinkes-id', 'DINKES', ['PKM1']), entry('pkm1-id', 'PKM1')],
    };

    const blob = await buildConsolidatedWorkbook(index, readProject);
    const wb = XLSX.read(await blob.arrayBuffer(), { type: 'array' });
    const childSheet = wb.Sheets['DINKES_PKM1'];
    const rows = XLSX.utils.sheet_to_json<string[]>(childSheet, { header: 1 });

    const nomorColIdx = (rows[0] as string[]).indexOf('nomor');
    const firstDataRow = rows[1] as string[];
    expect(firstDataRow[nomorColIdx]).toBe('1.4.1'); // link nomor '1.4' + root PKM1 nomor '1'
  });

  it('a project with no linked children still gets exactly one sheet', async () => {
    const solo = makeProject('solo-id', 'DISHUB');
    const readProject = async (id: string) => (id === 'solo-id' ? solo : null);
    const index: ProjectIndex = { version: 1, activeId: null, entries: [entry('solo-id', 'DISHUB')] };

    const blob = await buildConsolidatedWorkbook(index, readProject);
    const wb = XLSX.read(await blob.arrayBuffer(), { type: 'array' });
    expect(wb.SheetNames).toEqual(['Rekap Pemerintah', 'DISHUB']);
  });
});

function entry(id: string, kodeOPD: string, linkedCodes: string[] = []): ProjectIndexEntry {
  return {
    id,
    namaOPD: kodeOPD,
    kodeOPD,
    nodeCount: 1,
    totalKebutuhan: 0,
    totalEksisting: 0,
    updatedAt: new Date().toISOString(),
    lastExportedAt: null,
    linkedCodes,
  };
}
