import { ImageResponse } from "next/og";
import { OG_SIZE, plexMono, tornEdge } from "@/lib/og";

export const runtime = "edge";
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Printed by Kartavyaa Patel. HOPIUM: an AI that admits when it's wrong.";

export default async function Image() {
  const font = await plexMono(700);
  const W = 760;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#13120F", alignItems: "center", justifyContent: "center", fontFamily: "Plex" }}>
        <div style={{ display: "flex", flexDirection: "column", width: W }}>
          <svg width={W} height="14"><polygon points={tornEdge(W, 40, 14, true)} fill="#1E1C18" /></svg>
          <div style={{ display: "flex", flexDirection: "column", background: "#1E1C18", padding: "28px 48px 40px", color: "#D6CEBD" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 20, color: "#8F897C" }}>
              <span>HOPIUM / PRINTED BY</span><span>NO. 001</span>
            </div>
            <div style={{ height: 1, background: "#3A362E", marginTop: 14 }} />
            <div style={{ fontSize: 64, lineHeight: 1.05, marginTop: 30, letterSpacing: -2 }}>PRINTED BY</div>
            <div style={{ fontSize: 64, lineHeight: 1.05, letterSpacing: -2 }}>KARTAVYAA PATEL</div>
            <div style={{ fontSize: 28, marginTop: 26, color: "#8F897C" }}>An AI that admits when it&apos;s wrong.</div>
            <div style={{ display: "flex", marginTop: 34, alignSelf: "flex-end", transform: "rotate(-4deg)", border: "4px solid #6FA27E", color: "#6FA27E", fontSize: 22, padding: "6px 16px", opacity: 0.9 }}>
              BUILT IN PUBLIC. GRADED IN PUBLIC.
            </div>
          </div>
          <svg width={W} height="14"><polygon points={tornEdge(W, 40, 14)} fill="#1E1C18" /></svg>
        </div>
      </div>
    ),
    { ...size, fonts: font ? [{ name: "Plex", data: font, weight: 700 }] : [] },
  );
}
