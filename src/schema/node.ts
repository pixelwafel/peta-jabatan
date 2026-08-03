import { z } from 'zod';
import { zRincian } from './rincian';

export const zLinkRef = z.object({
  projectCode: z.string(),
  projectName: z.string(),
  cached: z.object({
    totalKebutuhan: z.number().int().min(0),
    totalEksisting: z.number().int().min(0),
    nodeCount: z.number().int().min(0),
    updatedAt: z.string(),
  }),
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
    unitKerja: z.string().optional(),
    keterangan: z.string().optional(),
    custom: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
    link: zLinkRef.optional(),
    isTemplate: z.boolean().optional(),
    position: z.object({ x: z.number(), y: z.number() }),
    collapsed: z.boolean().default(false),
  })
  .refine(n => n.type !== 'unit' || n.rincian.length === 0, {
    message: 'Node unit tidak boleh memiliki rincian angka',
    path: ['rincian'],
  });

export type ZNode = z.infer<typeof zNode>;
