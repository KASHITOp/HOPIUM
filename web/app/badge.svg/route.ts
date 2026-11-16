import { badgeData, badgeSegments, badgeSvg } from "@/lib/badge";
import { getPredictions, getRunLog, getWitness } from "@/lib/data";

export const dynamic = "force-dynamic"; // the CDN cache below is the only cache (at most 1 hour)

export async function GET() {
  const [p, runs, w] = await Promise.all([getPredictions(100000), getRunLog(3), getWitness()]);
  const failed = p.error ?? runs.error ?? w.error;
  const svg = failed || p.mode === "mock"
    ? badgeSvg([{ text: "HOPIUM", tone: "ink" }, { text: failed ? "data unavailable" : "DEMO DATA", tone: "red" }])
    : badgeSvg(badgeSegments(badgeData(p.data, runs.data, w.data)));
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      // max-age counts from when the CDN fetched it (Age header), so no copy is older than 1 hour; failures retry in 5 min
      "Cache-Control": failed ? "public, max-age=300, s-maxage=300" : "public, max-age=3600, s-maxage=3600",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
    },
  });
}
