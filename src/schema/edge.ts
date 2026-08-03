import { z } from 'zod';

export const zEdge = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  kind: z.enum(['hirarki', 'koordinasi', 'pembinaan']),
});

export type ZEdge = z.infer<typeof zEdge>;
