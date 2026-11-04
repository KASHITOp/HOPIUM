/**
 * Three different questions, three different metrics (trust v1). Never reuse one label for another.
 *   1. direction  Was the sign right? HIT/MISS; |move| < 0.1% (strict) is FLAT and excluded. Rule "grade-v1",
 *                 identical to the DB constraint outcome_matches_move. This is what the stored `outcome` means.
 *   2. target     Did the event the probabilities describe happen? BIG_UP iff move > +k, BIG_DOWN iff move < -k
 *                 (both strict; move exactly +-k is NOTHING). Same as the training label (ml/research/harness.py label3).
 *   3. trade      Net simulated return after the modelled round-trip fee: side * move - fee. Profitable iff > 0 (strict).
 * NO_CALL rows have no direction verdict, no declared target, and no trade. Ungraded rows are pending in all three.
 */
import { FEE_ROUND_TRIP, FLAT_THRESHOLD, netReturn } from "./grading";
import type { Prediction } from "./types";

export const RULES = {
  grading: "grade-v1",
  flat_threshold: FLAT_THRESHOLD,
  flat_rule: "|move| < 0.1% is FLAT (strict); exactly 0.1% is graded HIT/MISS",
  target_rule: "BIG_UP iff move > +k, BIG_DOWN iff move < -k (strict)",
  fee_round_trip: FEE_ROUND_TRIP,
  fee_rule: "0.1% per side, 0.2% round trip; no slippage, spread, funding or taxes",
} as const;

export type Direction = "HIT" | "MISS" | "FLAT" | "NO_CALL" | "PENDING";

export interface RowOutcome {
  direction: Direction;
  declared: "BIG_UP" | "BIG_DOWN" | null; // the event the call implies
  target: boolean | null; // did the declared event occur
  net: number | null; // trade net after fees
  profitable: boolean | null;
}

export function rowOutcome(p: Pick<Prediction, "signal" | "move" | "outcome" | "k">, fee = FEE_ROUND_TRIP): RowOutcome {
  const declared = p.signal === "UP" ? "BIG_UP" : p.signal === "DOWN" ? "BIG_DOWN" : null;
  if (p.signal === "NO_CALL") return { direction: p.move === null ? "PENDING" : "NO_CALL", declared, target: null, net: null, profitable: null };
  if (p.move === null || p.outcome === null) return { direction: "PENDING", declared, target: null, net: null, profitable: null };
  const k = p.k ?? 0.01;
  const target = declared === "BIG_UP" ? p.move > k : p.move < -k;
  const net = netReturn(p.signal, p.move, fee);
  return { direction: p.outcome as Direction, declared, target, net, profitable: net > 0 };
}

export interface OutcomeSummary {
  rows: number;
  excluded: { noCall: number; pending: number };
  direction: { hits: number; misses: number; flat: number; denominator: number }; // denominator = hits + misses
  target: { occurred: number; denominator: number }; // graded UP/DOWN calls, FLAT included
  trade: { profitable: number; denominator: number; sumNet: number }; // graded UP/DOWN calls, FLAT included
}

export function summarizeOutcomes(rows: Pick<Prediction, "signal" | "move" | "outcome" | "k">[], fee = FEE_ROUND_TRIP): OutcomeSummary {
  const s: OutcomeSummary = { rows: rows.length, excluded: { noCall: 0, pending: 0 }, direction: { hits: 0, misses: 0, flat: 0, denominator: 0 },
    target: { occurred: 0, denominator: 0 }, trade: { profitable: 0, denominator: 0, sumNet: 0 } };
  for (const r of rows) {
    const o = rowOutcome(r, fee);
    if (o.direction === "PENDING") { s.excluded.pending++; continue; }
    if (o.direction === "NO_CALL") { s.excluded.noCall++; continue; }
    if (o.direction === "HIT") s.direction.hits++;
    else if (o.direction === "MISS") s.direction.misses++;
    else s.direction.flat++;
    s.target.denominator++;
    if (o.target) s.target.occurred++;
    s.trade.denominator++;
    if (o.profitable) s.trade.profitable++;
    s.trade.sumNet += o.net!;
  }
  s.direction.denominator = s.direction.hits + s.direction.misses;
  return s;
}
