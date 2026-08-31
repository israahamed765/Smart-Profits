"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/frontend/components/ui/card";
import { useAppearance } from "@/frontend/context/appearance";

export function AdvisorHelpCards() {
  const { t } = useAppearance();
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("advisor.help.file")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm leading-7 text-muted">
          <p>{t("advisor.help.file.body")}</p>
          <p>{t("advisor.help.cols")}:</p>
          <ul className="list-disc pe-5">
            <li>Date / التاريخ</li>
            <li>Product / Description / اسم المنتج</li>
            <li>Quantity / الكمية</li>
            <li>Price / Selling Price / سعر البيع</li>
            <li>Cost / COGS / التكلفة</li>
            <li>Sales / Revenue / المبيعات</li>
            <li>Expense / المصروف</li>
          </ul>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("advisor.help.net")}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm leading-7 text-muted">{t("advisor.help.net.body")}</CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("advisor.help.know")}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm leading-7 text-muted">{t("advisor.help.know.body")}</CardContent>
      </Card>
    </div>
  );
}
