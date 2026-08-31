import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().email("ضعي بريداً إلكترونياً صحيحاً.").transform((value) => value.toLowerCase()),
  password: z.string().min(6, "كلمة المرور 6 أحرف على الأقل."),
});

export const registerSchema = z.object({
  fullName: z.string().trim().min(2, "الاسم مطلوب.").max(80),
  storeName: z.string().trim().min(2, "اسم المتجر مطلوب.").max(80),
  email: z.string().trim().email("ضعي بريداً إلكترونياً صحيحاً.").transform((value) => value.toLowerCase()),
  phone: z.string().trim().min(8, "رقم الجوال مطلوب."),
  password: z.string().min(6, "كلمة المرور 6 أحرف على الأقل.").max(128),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email("ضعي بريداً إلكترونياً صحيحاً.").transform((value) => value.toLowerCase()),
});

export const resetPasswordSchema = z.object({
  email: z.string().trim().email("ضعي بريداً إلكترونياً صحيحاً.").transform((value) => value.toLowerCase()),
  code: z.string().trim().min(4, "كود إعادة التعيين مطلوب."),
  password: z.string().min(6, "كلمة المرور الجديدة 6 أحرف على الأقل.").max(128),
});
