import { ImageResponse } from "next/og";
import engine from "@/lib/engine.json";
import { OG_SIZE, plexMono, tornEdge } from "@/lib/og";

export const runtime = "edge";
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "HOPIUM: an AI that admits when it's wrong. Does not beat trading fees in testing.";

export default async function Image() {
  const font = await plexMono(700);
  const W = 1040;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#13120F", alignItems: "center", justifyContent: "center", fontFamily: "Plex" }}>
        <div style={{ display: "flex", flexDirection: "column", width: W }}>
          <svg width={W} height="14"><polygon points={tornEdge(W, 52, 14, true)} fill="#1E1C18" /></svg>
          <div style={{ display: "flex", flexDirection: "column", background: "#1E1C18", padding: "26px 52px 34px", color: "#D6CEBD", position: "relative" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 20, color: "#8F897C" }}>
              <span>HOPIUM / RECEIPT</span><span>BTC . ETH . SOL</span>
            </div>
            <div style={{ height: 1, background: "#3A362E", marginTop: 14 }} />
            <div style={{ fontSize: 132, letterSpacing: -6, lineHeight: 1, marginTop: 26 }}>HOPIUM</div>
            <div style={{ fontSize: 40, marginTop: 18 }}>An AI that admits when it&apos;s wrong.</div>
            <div style={{ fontSize: 22, marginTop: 16, color: "#8F897C" }}>Every call logged before the outcome. Graded in public.</div>
            <div style={{ display: "flex", marginTop: 34, alignSelf: "flex-start", transform: "rotate(-3deg)", border: "5px solid #D4614C", color: "#D4614C", fontSize: 34, padding: "8px 22px", opacity: 0.9 }}>
              {engine.label.replace(/\.$/, "").toUpperCase()}
            </div>
          </div>
          <svg width={W} height="14"><polygon points={tornEdge(W, 52, 14)} fill="#1E1C18" /></svg>
        </div>
      </div>
    ),
    { ...size, fonts: font ? [{ name: "Plex", data: font, weight: 700 }] : [] },
  );
}
