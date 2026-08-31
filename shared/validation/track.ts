import { z } from "zod";

export const trackEventSchema = z.object({
  type: z.enum(["register", "analyze", "doctor", "whatif", "leak", "upload_error", "login"]),
  at: z.number().int().positive(),
  label: z.string().max(160).optional(),
});
