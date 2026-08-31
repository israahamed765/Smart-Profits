import * as React from "react";
import { cn } from "@/frontend/ui/cn";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-11 w-full rounded-xl border border-border bg-background px-3 text-base text-foreground outline-none transition placeholder:text-muted focus:border-primary/70 focus:ring-2 focus:ring-primary/20 sm:text-sm",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
