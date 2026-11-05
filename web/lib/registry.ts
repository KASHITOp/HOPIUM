/** Model and rule registry (WS8). DB table model_registry, falling back to the committed copy of ml/models/registry.json. */
import reg from "./registry.json";
import type { Prediction } from "./types";

export interface ModelEntry {
  model_version: string; artifact_sha256: string | null; code_commit: string | null; feature_schema: string | null;
  training_period: string | null; training_cutoff: string | null; decision_rule: string; grading_rule: string;
  change_kind: "initial" | "retrain_same_procedure" | "procedure_change"; change_reason: string;
  research_artifacts: string | null; activated_at?: string | null; retired_at?: string | null;
}
export const STATIC_REGISTRY = reg.models as ModelEntry[];

export interface VersionStats { version: string; rows: number; calls: number; graded: number; hits: number; misses: number; flats: number; first: string | null; last: string | null; entry: ModelEntry | null }

/** Prospective record per exact version. Never pooled unless the caller labels the aggregate. */
export function perVersion(preds: Prediction[], entries: ModelEntry[]): VersionStats[] {
  const by = new Map<string, Prediction[]>();
  for (const p of preds) by.set(p.model_version, [...(by.get(p.model_version) ?? []), p]);
  const names = new Set([...entries.map((e) => e.model_version), ...by.keys()]);
  return [...names].map((v) => {
    const ps = (by.get(v) ?? []).slice().sort((a, b) => a.candle_close_time.localeCompare(b.candle_close_time));
    return { version: v, rows: ps.length, calls: ps.filter((p) => p.signal !== "NO_CALL").length,
      graded: ps.filter((p) => p.outcome !== null).length, hits: ps.filter((p) => p.outcome === "HIT").length,
      misses: ps.filter((p) => p.outcome === "MISS").length, flats: ps.filter((p) => p.outcome === "FLAT").length,
      first: ps[0]?.candle_close_time ?? null, last: ps.at(-1)?.candle_close_time ?? null,
      entry: entries.find((e) => e.model_version === v) ?? null };
  });
}
