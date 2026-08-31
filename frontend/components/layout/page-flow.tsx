"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { useAppearance } from "@/frontend/context/appearance";
import { cn } from "@/frontend/ui/cn";

const STEPS = [
  { href: "/data", key: "nav.files" },
  { href: "/dashboard", key: "nav.diagnosis" },
  { href: "/simulator", key: "nav.simulation" },
  { href: "/advisor", key: "nav.advisor" },
  { href: "/settings", key: "nav.reports" },
] as const;

export function PageFlow() {
  const pathname = usePathname();
  const { t } = useAppearance();

  return (
    <nav className="flex flex-nowrap items-center gap-1 overflow-x-auto text-xs [-ms-overflow-style:none] [scrollbar-width:thin]">
      {STEPS.map((step, index) => {
        const active = pathname === step.href;
        return (
          <span key={step.href} className="flex shrink-0 items-center gap-1">
            {index > 0 && <ChevronLeft className="h-3 w-3 text-muted ltr:rotate-180" />}
            <Link
              href={step.href}
              className={cn(
                "inline-block shrink-0 rounded-lg px-2 py-1 transition",
                active ? "bg-primary/20 text-foreground" : "text-muted hover:text-foreground",
              )}
            >
              {t(step.key)}
            </Link>
          </span>
        );
      })}
    </nav>
  );
}
