import { z } from 'zod';
import { zNode } from './node';
import { zEdge } from './edge';
import { zCustomAttribute } from './attribute';

export const zProjectMeta = z.object({
  namaOPD: z.string(),
  kodeOPD: z.string(),
  penyusun: z.string(),
  tahunAnggaran: z.string().optional(),
  keterangan: z.string().optional(),
});

export const zViewport = z.object({
  x: z.number(),
  y: z.number(),
  zoom: z.number(),
});

export const zUnitInstance = z.object({
  id: z.string(),
  templateNodeId: z.string(),
  nama: z.string(),
  kode: z.string().optional(),
  figures: z.record(
    z.object({
      kebutuhan: z.number().int().min(0),
      eksisting: z.number().int().min(0),
    })
  ),
  keterangan: z.string().optional(),
});

export const zProject = z
  .object({
    id: z.string(),
    schemaVersion: z.string(),
    configVersion: z.string(),
    meta: zProjectMeta,
    attributeSchema: z.array(zCustomAttribute).default([]),
    nodes: z.array(zNode),
    edges: z.array(zEdge),
    instances: z.array(zUnitInstance).optional(),
    viewport: zViewport,
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .superRefine((p, ctx) => {
    const ids = new Set<string>();
    for (const n of p.nodes) {
      if (ids.has(n.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `ID duplikat: ${n.id}`,
          path: ['nodes'],
        });
      }
      ids.add(n.id);
    }
    for (const e of p.edges) {
      if (!ids.has(e.source) || !ids.has(e.target)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Edge menunjuk node yang tidak ada: ${e.id}`,
          path: ['edges'],
        });
      }
    }
  });

export type ZProject = z.infer<typeof zProject>;
