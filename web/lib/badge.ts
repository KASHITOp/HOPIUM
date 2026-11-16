/**
 * Live badge (/badge.svg). Pure: numbers from public rows, SVG from those numbers. Tested in badge.test.ts.
 *   live / stalled   live if the newest prediction was stored less than 2 h ago (the job runs hourly)
 *   episodes k/n     all-time graded episodes (rule episode-v1), hits of hits + misses; flat episodes excluded
 *   coverage (24h)   published share of the settled slots whose reference close is in the last 24 h (floored)
 *   Bitcoin-stamped  an OpenTimestamps stamp of the chain head was submitted in the last 26 h (hourly job + slack);
 *                    otherwise "stamp stale" or "not stamped"
 */
import type { WitnessReceipt } from "./commit";
import { ledger, summary } from "./coverage";
import { clusterEpisodes, episodeHitRate } from "./evidence";
import type { Prediction, RunLog } from "./types";

const H = 3600e3;

export interface BadgeData { live: boolean; episodes: { hits: number; n: number }; coverage24: number | null; stamp: "stamped" | "stale" | "none" }

export function badgeData(preds: Prediction[], runs: RunLog[], witness: WitnessReceipt[], now = Date.now()): BadgeData {
  const newest = Math.max(-Infinity, ...preds.map((p) => Date.parse(p.inserted_at)));
  const ep = clusterEpisodes(preds);
  const eh = episodeHitRate(ep.episodes, preds);
  const slots = ledger(preds, runs, now).filter((s) => Date.parse(s.close) > now - 24 * H);
  const cov = summary(slots).pct;
  const ok = witness.filter((w) => w.status !== "failed").map((w) => Date.parse(w.logged_at));
  const lastStamp = ok.length ? Math.max(...ok) : null;
  return {
    live: now - newest < 2 * H,
    episodes: { hits: eh.hits, n: eh.n },
    coverage24: cov,
    stamp: lastStamp === null ? "none" : now - lastStamp < 26 * H ? "stamped" : "stale",
  };
}

export function badgeSegments(d: BadgeData): { text: string; tone: "ink" | "green" | "red" | "faded" }[] {
  const cov = d.coverage24 === null ? "n/a" : `${Math.floor(d.coverage24 * 100)}%`;
  return [
    { text: `HOPIUM ${d.live ? "live" : "stalled"}`, tone: d.live ? "ink" : "red" },
    { text: `episodes ${d.episodes.hits}/${d.episodes.n}`, tone: "ink" },
    { text: `coverage ${cov} (24h)`, tone: d.coverage24 !== null && d.coverage24 < 0.9 ? "red" : "ink" },
    { text: d.stamp === "stamped" ? "Bitcoin-stamped" : d.stamp === "stale" ? "stamp stale" : "not stamped", tone: d.stamp === "stamped" ? "green" : "faded" },
  ];
}

const TONE = { ink: "#D6CEBD", green: "#6FA27E", red: "#D4614C", faded: "#8F897C" } as const;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Dark receipt strip: slip colour, dashed separators, torn bottom edge. Monospace, so width = chars x 6.6 px at 11 px. */
export function badgeSvg(segments: { text: string; tone: keyof typeof TONE }[]): string {
  const CH = 6.6, PAD = 8, H_BODY = 20, TEETH = 4;
  let x = 0;
  const parts: string[] = [];
  segments.forEach((s, i) => {
    const w = Math.ceil(s.text.length * CH + PAD * 2);
    if (i) parts.push(`<line x1="${x}" y1="4" x2="${x}" y2="${H_BODY - 4}" stroke="#3A362E" stroke-dasharray="2 2"/>`);
    parts.push(`<text x="${x + PAD}" y="14" fill="${TONE[s.tone]}">${esc(s.text)}</text>`);
    x += w;
  });
  const W = x;
  const teeth: string[] = [];
  for (let i = 0, n = Math.ceil(W / 6); i <= n; i++) teeth.push(`${Math.min(W, i * 6)},${H_BODY + (i % 2 ? TEETH : 0)}`);
  const label = segments.map((s) => s.text).join(" | ");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H_BODY + TEETH}" viewBox="0 0 ${W} ${H_BODY + TEETH}" role="img" aria-label="${esc(label)}">` +
    `<title>${esc(label)}</title>` +
    `<polygon points="0,0 ${W},0 ${teeth.reverse().join(" ")} 0,${H_BODY}" fill="#1E1C18"/>` +
    `<g font-family="'IBM Plex Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" font-size="11">${parts.join("")}</g></svg>`;
}
