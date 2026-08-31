import { z } from "zod";

const currencyCode = z.enum(["SAR", "USD", "AED", "JOD", "ILS"]);

export const reportExportSchema = z.object({
  monthKey: z.string().min(4).max(16),
  mode: z.enum(["html", "pdf"]),
  scope: z.enum(["month", "all"]).optional(),
  currency: currencyCode.optional(),
  fileId: z.string().min(1).max(120).optional(),
});
