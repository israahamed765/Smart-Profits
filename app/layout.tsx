import type { Metadata } from "next";
import { Cairo, Plus_Jakarta_Sans } from "next/font/google";
import { Providers } from "@/frontend/components/providers";
import "./globals.css";

const cairo = Cairo({
  variable: "--font-cairo",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
});

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Smart Profits | مستشار التاجر الذكي",
  description: "من ملف Excel فوضوي إلى قرار تجاري: تشخيص، تسريب الربح، محاكاة، وخطة 30 يوماً",
  icons: { icon: "/brand/mark.png", apple: "/brand/mark.png" },
};

const bootScript = `
try {
  var t = localStorage.getItem("smartprofit-theme") || "dark";
  var l = localStorage.getItem("smartprofit-locale") || "ar";
  document.documentElement.classList.toggle("dark", t === "dark");
  document.documentElement.classList.toggle("light", t === "light");
  document.documentElement.lang = l;
  document.documentElement.dir = l === "ar" ? "rtl" : "ltr";
} catch (e) {}
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ar" dir="rtl" className={`${cairo.variable} ${jakarta.variable} h-full overflow-x-clip antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: bootScript }} />
      </head>
      <body className="min-h-full overflow-x-clip bg-background font-sans text-foreground">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
