import { ProtectedLayout } from "@/frontend/components/layout/protected-layout";

export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  return <ProtectedLayout>{children}</ProtectedLayout>;
}
