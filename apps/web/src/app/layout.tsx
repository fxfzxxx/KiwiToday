import type { Metadata } from "next";
import { Noto_Sans_SC } from "next/font/google";
import { LocaleProvider } from "@/components/LocaleProvider";
import "./globals.css";

const notoSansSC = Noto_Sans_SC({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://kiwitoday.nz"),
  title: {
    default: "KiwiToday · 新西兰本地活动",
    template: "%s · KiwiToday",
  },
  description:
    "Markets, gigs, hikes and games across Aotearoa — aggregated from Eventfinda, Ticketmaster, councils and venues. 新西兰本地活动聚合，中英双语。",
  openGraph: { type: "website", locale: "zh_CN", alternateLocale: ["en_NZ"] },
  icons: { icon: "/brand/kiwitoday-logo-light.png", shortcut: "/brand/kiwitoday-logo-light.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className={`${notoSansSC.variable} min-h-screen font-sans antialiased`}><LocaleProvider>{children}</LocaleProvider></body>
    </html>
  );
}
