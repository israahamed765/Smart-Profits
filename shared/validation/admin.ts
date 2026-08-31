import { z } from "zod";

export const adminLoginSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  password: z.string().min(1, "كلمة المرور مطلوبة."),
});

export const adminUserPatchSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  plan: z.enum(["free", "pro", "business"]).optional(),
  status: z.enum(["active", "inactive", "churned"]).optional(),
});
