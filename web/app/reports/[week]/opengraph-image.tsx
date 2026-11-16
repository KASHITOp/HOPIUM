import { ImageResponse } from "next/og";
import { OG_SIZE, plexMono, tornEdge } from "@/lib/og";
import { floorPct, parseWeekKey, weekRange } from "@/lib/report";
import { loadReports } from "@/lib/reportData";

export const runtime = "edge";
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "HOPIUM weekly printer report";

export default async function Image({ params }: { params: { week: string } }) {
  const font = await plexMono(500);
  const ok = parseWeekKey(params.week) !== null;
  const { weeks, build, error } = ok ? await loadReports() : { weeks: [] as string[], build: null, error: null };
  const r = !error && build && weeks.includes(params.week) ? build(params.week) : null;
  const cell = (k: string, v: string, color = "#D6CEBD") => (
    <div style={{ display: "flex", flexDirection: "column", width: 250 }}>
      <span style={{ fontSize: 18, color: "#8F897C" }}>{k}</span>
      <span style={{ fontSize: 46, color }}>{v}</span>
    </div>
  );
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#13120F", alignItems: "center", justifyContent: "center", fontFamily: "Plex" }}>
        <div style={{ display: "flex", flexDirection: "column", width: 820 }}>
          <svg width="820" height="12"><polygon points={tornEdge(820, 54, 12, true)} fill="#1E1C18" /></svg>
          <div style={{ display: "flex", flexDirection: "column", background: "#1E1C18", padding: "22px 44px", color: "#D6CEBD" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 20, color: "#8F897C" }}>
              <span>HOPIUM / WEEKLY PRINTER REPORT</span><span>{params.week}</span>
            </div>
            <div style={{ height: 1, background: "#3A362E", marginTop: 14 }} />
            {r ? (
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ fontSize: 30, marginTop: 16 }}>{weekRange(r)}, UTC</span>
                <div style={{ display: "flex", marginTop: 22 }}>
                  {cell("calls made", String(r.calls))}
                  {cell("hits / misses", `${r.hits} / ${r.misses}`)}
                  {cell("sat out", String(r.satOut), "#8F897C")}
                </div>
                <div style={{ display: "flex", marginTop: 18 }}>
                  {cell("episodes right", r.episodes.n ? `${r.episodes.hits} / ${r.episodes.n}` : "n/a")}
                  {cell("coverage", floorPct(r.coverage.pct), r.coverage.pct !== null && r.coverage.pct < 0.9 ? "#D4614C" : "#D6CEBD")}
                  {cell("pending", String(r.pending), "#8F897C")}
                </div>
                <span style={{ fontSize: 20, color: "#8F897C", marginTop: 22 }}>
                  {r.rekt ? `REKT of the week: #${r.rekt.id} ${r.rekt.coin} ${r.rekt.signal}, lean ${(r.rekt.lean * 100).toFixed(1)}%` : "REKT of the week: no graded misses"}
                </span>
              </div>
            ) : (
              <span style={{ fontSize: 40, marginTop: 30 }}>{error ? "Database unreachable" : "No report for this week"}</span>
            )}
            <div style={{ fontSize: 15, color: "#8F897C", marginTop: 26 }}>Small sample, overlapping calls. Not financial advice.</div>
          </div>
          <svg width="820" height="12"><polygon points={tornEdge(820, 54, 12)} fill="#1E1C18" /></svg>
        </div>
      </div>
    ),
    { ...size, fonts: font ? [{ name: "Plex", data: font, weight: 500 }] : [] },
  );
}
