"use client";

import { cn } from "@/frontend/ui/cn";

export function SectionTabs({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex flex-nowrap gap-1 overflow-x-auto rounded-2xl border border-border bg-white/3 p-1">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={cn(
            "shrink-0 rounded-xl px-3 py-2 text-sm transition sm:px-4",
            value === tab.id ? "bg-primary text-primary-foreground" : "text-muted hover:text-foreground",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
