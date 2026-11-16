import { describe, expect, it } from "vitest";
import { badgeData, badgeSegments, badgeSvg } from "./badge";
import type { WitnessReceipt } from "./commit";
import type { Prediction } from "./types";

const H = 3600e3;
const iso = (ms: number) => new Date(ms).toISOString();
const NOW = Date.UTC(2026, 10, 16, 22, 10);
let id = 1;
const p = (coin: string, t: number, signal: Prediction["signal"] = "NO_CALL", outcome: Prediction["outcome"] = null) =>
  ({ id: id++, coin, horizon: "12h", signal, candle_close_time: iso(t), inserted_at: iso(t + 2 * 60e3), target_time: iso(t + 12 * H), outcome, score: 0.2, prob_up: 0.3 }) as Prediction;
const stamp = (t: number, status: WitnessReceipt["status"] = "submitted") => ({ id: t, chain_seq: 1, chain_hash: "h", service: "ots", status, receipt_path: null, detail: null, logged_at: iso(t) }) as WitnessReceipt;

describe("live badge", () => {
  const top = Math.floor(NOW / H) * H;
  const rows: Prediction[] = [];
  for (let t = top - 30 * H; t <= top; t += H) if (t !== top - 5 * H) for (const c of ["BTC", "ETH", "SOL"]) rows.push(p(c, t));
  // episodes: BTC UP x2 overlapping (one episode, HIT), ETH DOWN MISS, SOL UP HIT, SOL DOWN FLAT (excluded from n)
  rows.push(p("BTC", top - 100 * H, "UP", "HIT"), p("BTC", top - 99 * H, "UP", "MISS"), p("ETH", top - 90 * H, "DOWN", "MISS"),
    p("SOL", top - 80 * H, "UP", "HIT"), p("SOL", top - 60 * H, "DOWN", "FLAT"));

  it("counts episodes (first call grades it) and 24h coverage", () => {
    const d = badgeData(rows, [], [stamp(NOW - 2 * H)], NOW);
    expect(d.episodes).toEqual({ hits: 2, n: 3 });
    expect(d.coverage24).toBe(69 / 72); // 24 settled hours in the window, one hour (3 slots) missing
    expect(d.live).toBe(true);
    expect(d.stamp).toBe("stamped");
    expect(badgeSegments(d).map((s) => s.text)).toEqual(["HOPIUM live", "episodes 2/3", "coverage 95% (24h)", "Bitcoin-stamped"]);
  });
  it("never rounds coverage up and flags stale or missing stamps and a stalled printer", () => {
    const d = badgeData(rows, [], [stamp(NOW - 30 * H), stamp(NOW - H, "failed")], NOW + 3 * H);
    expect(d.live).toBe(false);
    expect(d.stamp).toBe("stale");
    expect(badgeData(rows, [], [], NOW).stamp).toBe("none");
    expect(badgeSegments({ live: true, episodes: { hits: 0, n: 0 }, coverage24: 0.9999, stamp: "none" }).map((s) => s.text))
      .toEqual(["HOPIUM live", "episodes 0/0", "coverage 99% (24h)", "not stamped"]);
  });
  it("renders a small dark SVG with an accessible label", () => {
    const svg = badgeSvg(badgeSegments(badgeData(rows, [], [stamp(NOW)], NOW)));
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('aria-label="HOPIUM live | episodes 2/3 | coverage 95% (24h) | Bitcoin-stamped"');
    expect(svg).toContain("#1E1C18");
    expect(Number(/height="(\d+)"/.exec(svg)![1])).toBeLessThanOrEqual(28);
    expect(badgeSvg([{ text: "<x&>", tone: "ink" }])).toContain("&lt;x&amp;&gt;");
  });
});
