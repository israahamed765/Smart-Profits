import { z } from "zod";

export const profileUpdateSchema = z.object({
  fullName: z.string().trim().min(2).max(80).optional(),
  storeName: z.string().trim().min(2).max(80).optional(),
  phone: z.string().trim().min(8).max(20).optional(),
  homeLat: z.number().min(-90).max(90).nullable().optional(),
  homeLng: z.number().min(-180).max(180).nullable().optional(),
});
