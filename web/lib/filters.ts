import { provenanceOf } from "./provenance";
import { lean } from "./summary";
import type { Prediction } from "./types";

export const BANDS = [
  ["all", "any confidence"],
  ["flip", "under 52% lean"],
  ["mild", "52 to 56%"],
  ["hunch", "56 to 60%"],
  ["bold", "over 60%"],
] as const;
export type Band = (typeof BANDS)[number][0];

export interface Filters {
  coin: string;
  horizon: string;
  from: string;
  to: string;
  band: Band;
}

export function parseFilters(sp: Record<string, string | string[] | undefined>): Filters {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]) ?? "";
  const band = one("band");
  return {
    coin: ["BTC", "ETH", "SOL"].includes(one("coin")) ? one("coin") : "all",
    horizon: /^\d+h$/.test(one("horizon")) ? one("horizon") : "all",
    from: /^\d{4}-\d{2}-\d{2}$/.test(one("from")) ? one("from") : "",
    to: /^\d{4}-\d{2}-\d{2}$/.test(one("to")) ? one("to") : "",
    band: (BANDS.map((b) => b[0]) as string[]).includes(band) ? (band as Band) : "all",
  };
}

export function applyFilters(rows: Prediction[], f: Filters): Prediction[] {
  return rows.filter((r) => {
    if (f.coin !== "all" && r.coin !== f.coin) return false;
    if (f.horizon !== "all" && r.horizon !== f.horizon) return false;
    const day = r.candle_close_time.slice(0, 10);
    if (f.from && day < f.from) return false;
    if (f.to && day > f.to) return false;
    const l = lean(r);
    if (f.band === "flip" && !(l < 0.52)) return false;
    if (f.band === "mild" && !(l >= 0.52 && l < 0.56)) return false;
    if (f.band === "hunch" && !(l >= 0.56 && l <= 0.6)) return false;
    if (f.band === "bold" && !(l > 0.6)) return false;
    return true;
  });
}

const COLS = ["id", "coin", "horizon", "signal", "prob_up", "p_big_up", "p_big_down", "score", "threshold", "price_at_call",
  "candle_close_time", "inserted_at", "target_time", "price_at_target", "move", "outcome", "hit", "graded_at", "model_version",
  "provenance", "job_started_at", "input_cutoff_at", "generated_at", "run_id", "late_rule"] as const;

export function toCsv(rows: Prediction[]): string {
  const esc = (v: unknown) => (v === null || v === undefined ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  // provenance: blank in the database = legacy row; exported as the resolved label so blanks are never read as "live_prospective"
  return [COLS.join(","), ...rows.map((r) => COLS.map((c) => esc(c === "provenance" ? provenanceOf(r) : r[c])).join(","))].join("\n") + "\n";
}
