/**
 * Data provenance (trust v1). Every row the site shows resolves to exactly one of these.
 *   live_prospective  written by the live predict job after migration 20261105000000 (labelled at insert)
 *   legacy_live       in the live database but inserted before provenance labels existed. The database forced
 *                     inserted_at = now() and rejected inserts > 20 min after the candle close, so these were
 *                     recorded prospectively by the database clock; they are shown with this weaker label anyway.
 *   demo              lib/mock.ts fixtures. Synthetic, including every timestamp.
 *   backtest          research simulations (ml/research). Never stored as receipts.
 */
import type { Prediction } from "./types";

export type Provenance = "live_prospective" | "legacy_live" | "demo" | "backtest";

export const PROVENANCE_LABEL: Record<Provenance, string> = {
  live_prospective: "live, recorded before outcome",
  legacy_live: "live (pre-provenance label)",
  demo: "DEMO DATA, synthetic",
  backtest: "backtest simulation",
};

export function provenanceOf(r: Pick<Prediction, "provenance">): Provenance {
  if (r.provenance === "demo") return "demo";
  if (r.provenance === "live_prospective") return "live_prospective";
  return "legacy_live";
}

export const isLive = (r: Pick<Prediction, "provenance">) => {
  const p = provenanceOf(r);
  return p === "live_prospective" || p === "legacy_live";
};

/** The ONLY rows allowed into live metrics. Demo rows are dropped even if something mixes them in. */
export function liveOnly<T extends Pick<Prediction, "provenance">>(rows: T[]): T[] {
  return rows.filter(isLive);
}

/** Exact reported period: first and last reference candle close, UTC ISO. */
export function period(rows: Pick<Prediction, "candle_close_time">[]): { start: string; end: string } | null {
  if (!rows.length) return null;
  const t = rows.map((r) => Date.parse(r.candle_close_time));
  return { start: new Date(Math.min(...t)).toISOString(), end: new Date(Math.max(...t)).toISOString() };
}
