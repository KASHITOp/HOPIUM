import { ImageResponse } from "next/og";
import engine from "@/lib/engine.json";
import { OG_SIZE, plexMono } from "@/lib/og";

export const runtime = "edge";
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "HOPIUM: an AI that admits when it's wrong";

export default async function Image() {
  const font = await plexMono(700);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#13120F", color: "#D6CEBD", padding: 70, fontFamily: "Plex" }}>
        <div style={{ fontSize: 150, fontWeight: 700, letterSpacing: -8, lineHeight: 1 }}>HOPIUM</div>
        <div style={{ height: 6, background: "#D6CEBD", marginTop: 24 }} />
        <div style={{ fontSize: 44, marginTop: 36 }}>An AI that admits when it&apos;s wrong.</div>
        <div style={{ fontSize: 26, marginTop: 20, color: "#8F897C" }}>BTC, ETH, SOL direction calls. Logged before the outcome. Graded in public.</div>
        <div style={{ display: "flex", marginTop: "auto", fontSize: 24, color: "#8F897C", borderTop: "1px solid #3A362E", paddingTop: 20 }}>
          model label: <span style={{ color: "#D6CEBD", marginLeft: 12 }}>{engine.label}</span>
        </div>
      </div>
    ),
    { ...size, fonts: font ? [{ name: "Plex", data: font, weight: 700 }] : [] },
  );
}
