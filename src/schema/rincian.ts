import { z } from 'zod';

export const zRincian = z.object({
  id: z.string(),
  jenjangId: z.string().nullable(),
  kebutuhan: z.number().int().min(0),
  eksisting: z.number().int().min(0),
});

export type ZRincian = z.infer<typeof zRincian>;
