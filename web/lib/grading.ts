/**
 * The ONE grading rule, mirrored from ml/hopium/grading.py and the `outcome_matches_move` constraint in
 * supabase/schema.sql. The site never re-grades stored rows; this is used for mock data and for tests that prove
 * the three implementations agree.
 */
import type { Outcome, Signal } from "./types";

export const FLAT_THRESHOLD = 0.001; // |move| < 0.1% => FLAT
export const FEE_ROUND_TRIP = 0.002; // 0.1% per side

export function move(entry: number, exit: number): number {
  return (exit - entry) / entry;
}

export function grade(signal: Signal, entry: number, exit: number): { move: number; outcome: Outcome; hit: boolean | null } {
  const m = move(entry, exit);
  if (signal === "NO_CALL") return { move: m, outcome: "SAT_OUT", hit: null };
  if (Math.abs(m) < FLAT_THRESHOLD) return { move: m, outcome: "FLAT", hit: null };
  const hit = signal === "UP" ? m > 0 : m < 0;
  return { move: m, outcome: hit ? "HIT" : "MISS", hit };
}

/** v3 signal rule (ml/hopium/engine.py, DB constraint signal_matches_prob). */
export function signalFor(score: number, threshold: number, sides: "long_short" | "long_only" = "long_short"): Signal {
  if (score > threshold) return "UP";
  if (sides === "long_short" && score < -threshold) return "DOWN";
  return "NO_CALL";
}

/** Net return of following a graded call: long for UP, short for DOWN, minus round-trip fees. */
export function netReturn(signal: Signal, m: number, fee = FEE_ROUND_TRIP): number {
  if (signal === "NO_CALL") return 0;
  return (signal === "UP" ? m : -m) - fee;
}
