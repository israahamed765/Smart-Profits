import type { ColumnRole } from "@/lib/types";

export const COLUMN_ROLE_META: Record<
  ColumnRole,
  { label: string; purpose: string }
> = {
  date: {
    label: "التاريخ",
    purpose: "لتجميع المبيعات والمصاريف حسب اليوم والشهر",
  },
  product: {
    label: "اسم المنتج",
    purpose: "لمعرفة الأعلى مبيعاً والمنتجات الراكدة",
  },
  sku: {
    label: "كود المنتج",
    purpose: "للتمييز بين الأصناف المتشابهة بالاسم",
  },
  quantity: {
    label: "الكمية",
    purpose: "لحساب الإيراد = سعر البيع × الكمية",
  },
  sellingPrice: {
    label: "سعر البيع",
    purpose: "سعر الوحدة الذي يُحسب منه إجمالي المبيعات",
  },
  costPrice: {
    label: "سعر التكلفة",
    purpose: "تكلفة الوحدة لحساب تكلفة البضاعة المباعة",
  },
  revenue: {
    label: "الإيراد / المبيعات",
    purpose: "مبلغ المبيعات الجاهز إذا لم يتوفر سعر × كمية",
  },
  expense: {
    label: "المصروف",
    purpose: "مصاريف التشغيل مثل الشحن والتسويق",
  },
  category: {
    label: "التصنيف",
    purpose: "لتوزيع المنتجات والمصاريف حسب الفئة",
  },
  expenseType: {
    label: "نوع المصروف",
    purpose: "لتفصيل بنود المصاريف في الرسم الدائري",
  },
  notes: {
    label: "الملاحظات",
    purpose: "معلومة إضافية عن العملية مثل طريقة الدفع",
  },
};

export const ANALYSIS_STEPS = [
  { href: "/data", label: "الملفات" },
  { href: "/dashboard", label: "التشخيص" },
  { href: "/simulator", label: "المحاكاة" },
  { href: "/advisor", label: "الوكيل المالي" },
  { href: "/settings", label: "التقارير" },
] as const;
