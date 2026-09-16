import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://kiwitoday.nz"),
  title: {
    default: "Kiwi Local · 新西兰本地活动",
    template: "%s · Kiwi Local",
  },
  description:
    "Markets, gigs, hikes and games across Aotearoa — aggregated from Eventfinda, Ticketmaster, councils and venues. 新西兰本地活动聚合，中英双语。",
  openGraph: { type: "website", locale: "zh_CN", alternateLocale: ["en_NZ"] },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
