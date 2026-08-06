import { z } from 'zod';
import { zRincian } from './rincian';

export const zLinkRef = z.object({
  kodeOPD: z.string(),
  namaProject: z.string(),
  projectId: z.string().optional(),
  cached: z.object({
    kebutuhan: z.number().int().min(0),
    eksisting: z.number().int().min(0),
    nodeCount: z.number().int().min(0),
    updatedAt: z.string(),
  }),
});

// Fase 1.9 — kosong dulu di sini (zNode tidak mendeklarasikan field ini),
// jadi Zod (yang menanggalkan key tak dikenal secara default) diam-diam
// membuang kepalaUnit & locked pada setiap round-trip export->import JSON.
// Lihat models/node.ts KepalaUnit untuk bentuk sumber kebenarannya.
export const zKepalaUnit = z.object({
  nama: z.string().optional(),
  kode: z.string().optional(),
  jenjangId: z.string().nullable(),
  kebutuhan: z.number().int().min(0),
  eksisting: z.number().int().min(0),
});

export const zNode = z
  .object({
    id: z.string(),
    type: z.enum(['unit', 'jabatan']),
    nama: z.string(),
    nomor: z.string(),
    kode: z.string().optional(),
    kategoriId: z.string().optional(),
    rumpun: z.array(z.enum(['keahlian', 'keterampilan'])).default([]),
    rincian: z.array(zRincian).default([]),
    kepalaUnit: zKepalaUnit.optional(),
    unitKerja: z.string().optional(),
    keterangan: z.string().optional(),
    custom: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
    link: zLinkRef.optional(),
    isTemplate: z.boolean().optional(),
    position: z.object({ x: z.number(), y: z.number() }),
    collapsed: z.boolean().default(false),
    order: z.number().optional(), // absent on data from before the `order` field existed; see normalizeProject
    locked: z.boolean().optional(),
  })
  .refine(n => n.type !== 'unit' || n.rincian.length === 0, {
    message: 'Node unit tidak boleh memiliki rincian angka',
    path: ['rincian'],
  });

export type ZNode = z.infer<typeof zNode>;
