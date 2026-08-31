import { z } from "zod";

export const workspaceSaveSchema = z.object({
  workspace: z
    .object({
      version: z.number().int().positive().optional(),
      settings: z.record(z.string(), z.unknown()).optional(),
      activeFileId: z.string().min(1).max(120).optional(),
      files: z
        .array(
          z.object({
            id: z.string().min(1).max(120),
            fileName: z.string().min(1).max(260),
            uploadedAt: z.string().max(40).optional(),
            isDemo: z.boolean().optional(),
            // Untrusted client blob. Financial truth is recomputed in workspace.service / runFullAnalysis.
            parseResult: z.unknown(),
          }),
        )
        .min(1, "مساحة العمل فارغة.")
        .max(20, "عدد الملفات أكبر من المسموح."),
    })
    .passthrough(),
});
