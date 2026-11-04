import { ImageResponse } from "next/og";
import { getPrediction } from "@/lib/data";
import { price, signedPct } from "@/lib/format";
import { OG_SIZE, plexMono, tornEdge } from "@/lib/og";
import { lean } from "@/lib/summary";

export const runtime = "edge";
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "HOPIUM receipt";

const STAMP: Record<string, [string, string]> = {
  HIT: ["CALLED IT", "#6FA27E"], MISS: ["REKT", "#D4614C"], FLAT: ["DEAD MONEY", "#6E695F"], SAT_OUT: ["SAT OUT", "#6E695F"],
};

export default async function Image({ params }: { params: { id: string } }) {
  const font = await plexMono(500);
  const { data: p } = await getPrediction(Number(params.id));
  const stamp = p?.outcome ? STAMP[p.outcome]! : ["PENDING", "#898377"];
  const call = p ? (p.signal === "NO_CALL" ? "NO CALL" : p.signal) : "NOT FOUND";
  const callColor = p?.signal === "UP" ? "#6FA27E" : p?.signal === "DOWN" ? "#D4614C" : "#8F897C";
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#13120F", alignItems: "center", justifyContent: "center", fontFamily: "Plex" }}>
        <div style={{ display: "flex", flexDirection: "column", width: 620 }}>
          <svg width="620" height="12"><polygon points={tornEdge(620, 40, 12, true)} fill="#1E1C18" /></svg>
          <div style={{ display: "flex", flexDirection: "column", background: "#1E1C18", padding: "22px 40px", color: "#D6CEBD", position: "relative" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 20, color: "#8F897C" }}>
              <span>HOPIUM / RECEIPT</span><span>#{params.id}</span>
            </div>
            <div style={{ height: 1, background: "#3A362E", marginTop: 14 }} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 18 }}>
              <span style={{ fontSize: 76 }}>{p?.coin ?? "?"}</span>
              <span style={{ fontSize: 60, color: callColor }}>{call}</span>
            </div>
            {p && (
              <div style={{ display: "flex", flexDirection: "column", fontSize: 22, marginTop: 18, color: "#8F897C" }}>
                <span>next {p.horizon} . lean {(lean(p) * 100).toFixed(1)}%</span>
                <span>entry ${price(p.price_at_call)} . {p.candle_close_time.slice(0, 16).replace("T", " ")} UTC</span>
                {p.move !== null && <span style={{ color: "#D6CEBD" }}>exit ${price(p.price_at_target!)} . move {signedPct(p.move)}</span>}
              </div>
            )}
            <div style={{ display: "flex", position: "absolute", right: 36, top: 120, transform: "rotate(-7deg)", border: `5px solid ${stamp[1]}`, color: stamp[1], fontSize: 40, padding: "4px 18px", opacity: 0.85 }}>
              {stamp[0]}
            </div>
            <div style={{ fontSize: 15, color: "#8F897C", marginTop: 28 }}>Not financial advice. Predictions are probabilistic and often wrong.</div>
          </div>
          <svg width="620" height="12"><polygon points={tornEdge(620, 40, 12)} fill="#1E1C18" /></svg>
        </div>
      </div>
    ),
    { ...size, fonts: font ? [{ name: "Plex", data: font, weight: 500 }] : [] },
  );
}
