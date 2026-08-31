import type { AppSettings, Transaction } from "../types";

function mulberry32(seed: number) {
  return function next() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PRODUCTS = [
  { name: "سماعات لاسلكية", category: "إلكترونيات", price: 375, cost: 180, weight: 1.2 },
  { name: "ساعة ذكية", category: "إلكترونيات", price: 520, cost: 260, weight: 1 },
  { name: "شاحن سريع", category: "إكسسوارات", price: 85, cost: 32, weight: 0.9 },
  { name: "كيبورد ميكانيكي", category: "إلكترونيات استهلاكية", price: 240, cost: 140, weight: 0.35 },
  { name: "حامل لابتوب", category: "إلكترونيات استهلاكية", price: 95, cost: 40, weight: 0.25 },
] as const;

export const DEFAULT_SETTINGS: AppSettings = {
  storeName: "متجر التاجر",
  ownerName: "أحمد",
  defaultCurrency: "SAR",
  rent: 1500,
  salaries: 2500,
  utilities: 400,
  otherOpex: 300,
  opexIncludedInFile: false,
  opexSetupCompleted: false,
};

export function generateDemoTransactions(seed = 42): Transaction[] {
  const rand = mulberry32(seed);
  const transactions: Transaction[] = [];
  const start = new Date(2023, 4, 1);

  for (let monthOffset = 0; monthOffset < 6; monthOffset++) {
    const days = monthOffset === 5 ? 28 : 26;
    const demandBoost = 1 + monthOffset * 0.045;

    for (let day = 1; day <= days; day++) {
      for (const product of PRODUCTS) {
        const stagnant = product.name === "كيبورد ميكانيكي" || product.name === "حامل لابتوب";
        if (stagnant && monthOffset >= 2) continue;

        const electronicsDrop = product.category === "إلكترونيات استهلاكية" ? 1 - monthOffset * 0.12 : 1;
        const qty = Math.max(
          0,
          Math.round((2 + rand() * 6) * product.weight * demandBoost * electronicsDrop),
        );
        if (qty === 0) continue;

        const date = new Date(start.getFullYear(), start.getMonth() + monthOffset, day);
        transactions.push({
          date,
          product: product.name,
          sku: product.name.slice(0, 3),
          quantity: qty,
          sellingPrice: product.price,
          costPrice: product.cost,
          revenue: product.price * qty,
          expense: 0,
          category: product.category,
          expenseType: "",
          notes: "",
          bucket: "revenue",
        });
      }
    }

    const shippingBase = 4200 + monthOffset * 680;
    transactions.push({
      date: new Date(start.getFullYear(), start.getMonth() + monthOffset, 28),
      product: "شحن وتوصيل",
      sku: "SHIP",
      quantity: 1,
      sellingPrice: 0,
      costPrice: 0,
      revenue: 0,
      expense: shippingBase,
      category: "شحن",
      expenseType: "شحن",
      notes: "",
      bucket: "opex",
    });

    transactions.push({
      date: new Date(start.getFullYear(), start.getMonth() + monthOffset, 27),
      product: "حملة تسويق",
      sku: "MKT",
      quantity: 1,
      sellingPrice: 0,
      costPrice: 0,
      revenue: 0,
      expense: 3200 + monthOffset * 180,
      category: "تسويق",
      expenseType: "تسويق",
      notes: "",
      bucket: "opex",
    });
  }

  return transactions;
}

export const SAMPLE_CSV_TEMPLATE = `التاريخ,اسم المنتج,الكمية,سعر البيع,سعر التكلفة,الفئة,المصروف,نوع المصروف
2023-10-01,سماعات لاسلكية,12,375,180,إلكترونيات,,
2023-10-01,ساعة ذكية,8,520,260,إلكترونيات,,
2023-10-02,شاحن سريع,20,85,32,إكسسوارات,,
2023-10-03,كيبورد ميكانيكي,3,240,140,إلكترونيات استهلاكية,,
2023-10-28,شحن وتوصيل,1,0,0,شحن,8500,شحن
`;

export const SAMPLE_CSV_TEMPLATE_EN = `Date,Product,Quantity,Selling Price,Cost Price,Category,Expense,Expense Type
2023-10-01,Wireless Headphones,12,375,180,Electronics,,
2023-10-01,Smart Watch,8,520,260,Electronics,,
2023-10-02,Fast Charger,20,85,32,Accessories,,
2023-10-03,Mechanical Keyboard,3,240,140,Electronics,,
2023-10-28,Shipping & Delivery,1,0,0,Shipping,8500,Shipping
`;
