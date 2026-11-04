import { Analytics } from "@vercel/analytics/react";
import type { Metadata, Viewport } from "next";
import { DemoBanner, Footer, Masthead } from "@/components/Chrome";
import { InkDefs } from "@/components/Ink";
import { PriceStrip } from "@/components/PriceStrip";
import { MODE } from "@/lib/data";
import "./globals.css";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://hopium.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: "HOPIUM: an AI that admits when it's wrong", template: "%s | HOPIUM" },
  description:
    "Public crypto direction calls for BTC, ETH and SOL. Every prediction is stored before the outcome and graded in public, wins and losses.",
  openGraph: { type: "website", siteName: "HOPIUM", images: ["/opengraph-image"] },
  twitter: { card: "summary_large_image" },
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = { themeColor: "#13120F", colorScheme: "dark", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=IBM+Plex+Mono:wght@400;500;700&display=swap"
        />
      </head>
      <body className="min-h-screen bg-counter text-ink">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:bg-slip focus:p-2">
          Skip to content
        </a>
        <InkDefs />
        {MODE === "mock" && <DemoBanner />}
        <Masthead />
        <PriceStrip />
        <main id="main" className="mx-auto max-w-6xl px-4">
          {children}
        </main>
        <Footer />
        <Analytics />
      </body>
    </html>
  );
}
