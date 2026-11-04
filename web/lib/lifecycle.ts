/**
 * Prediction lifecycle (trust v1). Mirrors ml/hopium/lifecycle.py.
 * Which clock each time comes from matters: application-reported times are the job's own claim.
 * inserted_at and graded_at come from the database clock. Nothing is independently witnessed yet.
 */
import type { Prediction } from "./types";

export type Source = "market" | "application" | "database" | "derived";

export interface Stage { key: string; label: string; iso: string | null; source: Source }

export const LATE_RULE_V1 = { app_skip_minutes: 18, db_reject_minutes: 20 } as const;

export function stages(p: Prediction): Stage[] {
  return [
    { key: "slot", label: "scheduled slot / reference candle close", iso: p.candle_close_time, source: "market" },
    { key: "cutoff", label: "input data cutoff", iso: p.input_cutoff_at ?? null, source: "application" },
    { key: "started", label: "job started", iso: p.job_started_at ?? null, source: "application" },
    { key: "generated", label: "forecast generated", iso: p.generated_at ?? null, source: "application" },
    { key: "inserted", label: "stored and publicly readable", iso: p.inserted_at, source: "database" },
    { key: "eligible", label: "outcome horizon ends (gradeable)", iso: p.target_time, source: "derived" },
    { key: "graded", label: "graded", iso: p.graded_at, source: "database" },
  ];
}

const mins = (a: string | null | undefined, b: string | null | undefined) =>
  a && b ? (Date.parse(b) - Date.parse(a)) / 60e3 : null;

/** Minutes. null = not measurable (missing timestamp). */
export function latency(p: Prediction) {
  return {
    generation: mins(p.candle_close_time, p.generated_at), // application-reported
    publication: mins(p.candle_close_time, p.inserted_at), // database clock
    gradingDelay: mins(p.target_time, p.graded_at), // database clock
  };
}

/** Ordering problems in the stored timestamps (2-minute skew tolerance, as in the DB constraint). */
export function orderingIssues(p: Prediction): string[] {
  const t = (s?: string | null) => (s ? Date.parse(s) : null);
  const skew = 2 * 60e3, out: string[] = [];
  const close = t(p.candle_close_time)!, ins = t(p.inserted_at)!, cut = t(p.input_cutoff_at), gen = t(p.generated_at), st = t(p.job_started_at);
  if (ins < close) out.push("stored before the reference candle closed");
  if (ins > close + LATE_RULE_V1.db_reject_minutes * 60e3) out.push("stored after the 20-minute limit");
  if (cut !== null && cut > close) out.push("input cutoff after reference close");
  if (gen !== null && gen > ins + skew) out.push("generated after it was stored");
  if (st !== null && gen !== null && st > gen + skew) out.push("generated before the job started");
  if (p.graded_at && t(p.graded_at)! < t(p.target_time)!) out.push("graded before the horizon ended");
  return out;
}
