import * as React from "react";
import { cn } from "@/frontend/ui/cn";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1.5 block text-sm text-muted", className)} {...props} />;
}
