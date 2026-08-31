"use client";

import { Badge } from "@/frontend/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/frontend/components/ui/card";
import { useAnalysis } from "@/frontend/context/analysis-context";
import { formatMoney } from "@/frontend/lib/format";
import type { ProductPerformance } from "@/lib/types";

function Highlight({
  title,
  product,
  tone,
  detail,
  onPick,
}: {
  title: string;
  product: ProductPerformance | null;
  tone: "success" | "danger" | "info" | "warning";
  detail: string;
  onPick?: (name: string) => void;
}) {
  return (
    <Card
      className={`p-4 ${product && onPick ? "cursor-pointer hover:border-primary/40" : ""}`}
      onClick={() => product && onPick?.(product.name)}
    >
      <p className="text-xs text-muted">{title}</p>
      <p className="mt-2 text-base font-semibold text-foreground">{product?.name ?? "لا يوجد"}</p>
      {detail ? <p className="mt-1 text-sm text-muted">{detail}</p> : null}
      {product ? <Badge className="mt-2" tone={tone}>{product.isLoss ? "خسارة" : "ربح"}</Badge> : null}
    </Card>
  );
}

export function ProductSalesTable() {
  const { result, currency, setScope, scope } = useAnalysis();
  if (!result?.productHighlights) return null;
  const { catalog, highestSales, lowestSales, mostProfitable, lossMakers } = result.productHighlights;
  const worstLoss = lossMakers[0] ?? null;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Highlight
          title="أعلى منتج مبيعاً"
          product={highestSales}
          tone="success"
          detail={highestSales ? `${highestSales.saleCount} مرة • ${highestSales.quantity} قطعة` : ""}
          onPick={(name) => setScope({ product: name })}
        />
        <Highlight
          title="أقل منتج مبيعاً"
          product={lowestSales}
          tone="warning"
          detail={lowestSales ? `${lowestSales.saleCount} مرة • ${lowestSales.quantity} قطعة` : ""}
          onPick={(name) => setScope({ product: name })}
        />
        <Highlight
          title="المنتج الأكثر ربحاً"
          product={mostProfitable}
          tone="success"
          detail={mostProfitable ? formatMoney(mostProfitable.profit, currency) : ""}
          onPick={(name) => setScope({ product: name })}
        />
        <Highlight
          title="بيع قليل ويسبب خسارة"
          product={worstLoss}
          tone="danger"
          detail={
            worstLoss
              ? `${worstLoss.saleCount} مرة • ${formatMoney(worstLoss.profit, currency)}`
              : "لا يوجد منتج خاسر حالياً"
          }
          onPick={(name) => setScope({ product: name })}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>جدول القطع والمنتجات — اضغطي منتجاً لتحليله لوحده</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {catalog.length === 0 ? (
            <p className="text-sm text-muted">لا توجد منتجات مبيعات في هذا الملف.</p>
          ) : (
            <table className="w-full min-w-[800px] text-right text-sm">
              <thead className="text-slate-400">
                <tr className="border-b border-border">
                  <th className="px-2 py-2 font-medium">المنتج</th>
                  <th className="px-2 py-2 font-medium">مرات البيع</th>
                  <th className="px-2 py-2 font-medium">الكمية</th>
                  <th className="px-2 py-2 font-medium">المبيعات</th>
                  <th className="px-2 py-2 font-medium">التكلفة</th>
                  <th className="px-2 py-2 font-medium">الربح</th>
                  <th className="px-2 py-2 font-medium">الهامش</th>
                  <th className="px-2 py-2 font-medium">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {catalog.map((item) => (
                  <tr
                    key={item.name}
                    className={`cursor-pointer border-b border-border/60 text-slate-200 hover:bg-white/5 ${
                      scope.product === item.name ? "bg-accent/10" : ""
                    }`}
                    onClick={() => setScope({ product: scope.product === item.name ? null : item.name })}
                  >
                    <td className="px-2 py-2 font-medium text-foreground">{item.name}</td>
                    <td className="px-2 py-2">{item.saleCount} مرة</td>
                    <td className="px-2 py-2">{item.quantity} قطعة</td>
                    <td className="px-2 py-2">{formatMoney(item.revenue, currency)}</td>
                    <td className="px-2 py-2">{formatMoney(item.cogs, currency)}</td>
                    <td className={`px-2 py-2 ${item.profit >= 0 ? "text-accent" : "text-danger"}`}>
                      {formatMoney(item.profit, currency)}
                    </td>
                    <td className="px-2 py-2">{item.margin.toFixed(1)}%</td>
                    <td className="px-2 py-2">
                      <Badge tone={item.isLoss ? "danger" : item.saleCount <= 1 ? "warning" : "success"}>
                        {item.isLoss ? "خسارة" : item.saleCount <= 1 ? "راكد" : "جيد"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
