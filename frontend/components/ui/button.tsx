import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/frontend/ui/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-all duration-200 disabled:pointer-events-none disabled:opacity-50 cursor-pointer max-sm:min-h-11 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:opacity-90 shadow-lg shadow-primary/20",
        accent: "bg-accent text-slate-950 hover:opacity-90 shadow-lg shadow-accent/20",
        destructive: "bg-red-500/90 text-foreground hover:bg-red-500",
        outline: "border border-border bg-transparent text-foreground hover:bg-black/5 dark:hover:bg-white/5",
        ghost: "text-muted hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5",
        subtle: "bg-black/5 text-foreground hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10",
      },
      size: {
        default: "h-10 px-4",
        sm: "h-8 rounded-lg px-3 text-xs",
        lg: "h-12 px-5 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />
  ),
);
Button.displayName = "Button";
