import localFont from "next/font/local";

// Self-hosted (OFL-licensed files from Fontsource), metric-matched fallbacks: no render-blocking CSS, minimal layout shift.
export const display = localFont({
  src: [
    { path: "../app/fonts/bricolage-grotesque-latin-700-normal.woff2", weight: "700" },
    { path: "../app/fonts/bricolage-grotesque-latin-800-normal.woff2", weight: "800" },
  ],
  variable: "--font-display",
  display: "swap",
  adjustFontFallback: "Arial",
});

export const mono = localFont({
  src: [
    { path: "../app/fonts/ibm-plex-mono-latin-400-normal.woff2", weight: "400" },
    { path: "../app/fonts/ibm-plex-mono-latin-500-normal.woff2", weight: "500" },
    { path: "../app/fonts/ibm-plex-mono-latin-700-normal.woff2", weight: "700" },
  ],
  variable: "--font-mono",
  display: "swap",
  adjustFontFallback: false,
});
