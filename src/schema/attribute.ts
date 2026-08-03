import { z } from 'zod';

export const zCustomAttribute = z.object({
  id: z.string(),
  nama: z.string(),
  tipe: z.enum(['text', 'number', 'dropdown', 'boolean', 'date', 'multiline']),
  opsi: z.array(z.string()).optional(),
  wajib: z.boolean().optional(),
});

export type ZCustomAttribute = z.infer<typeof zCustomAttribute>;
