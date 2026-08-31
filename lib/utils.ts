/**
 * P1/P9 compatibility shim.
 * New code: `@/frontend/ui/cn` for class names, `@/shared/constants/math` for numbers.
 * P13.3: still unused by production imports; left in place (mixed UI + math).
 */
export { cn } from "@/frontend/ui/cn";
export { clamp, round2, safeDivide, unique } from "@/shared/constants/math";
