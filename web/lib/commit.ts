/**
 * Tamper evidence, scheme hopium-pred-v1. Byte-for-byte twin of ml/hopium/commit.py (shared vector in commit.test.ts).
 * canonical: JSON, keys sorted, no whitespace, values string|null; numbers -> toFixed(12) with trailing zeros removed;
 * timestamps -> YYYY-MM-DDTHH:MM:SS.ffffffZ (UTC only). payload_hash = sha256(canonical). chain_hash = sha256(prev + payload).
 */
import { createHash } from "crypto";

export const SCHEME = "hopium-pred-v1";
export const ZERO = "0".repeat(64);
export const FIELDS = ["id", "coin", "horizon", "signal", "prob_up", "p_big_up", "p_big_down", "score", "threshold", "k",
  "price_at_call", "candle_close_time", "target_time", "inserted_at", "model_version", "provenance",
  "job_started_at", "input_cutoff_at", "generated_at", "run_id", "late_rule"] as const;
const TIME = new Set(["candle_close_time", "target_time", "inserted_at", "job_started_at", "input_cutoff_at", "generated_at"]);
const TS = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|\+00:00|\+00)$/;

export interface Commitment { seq: number; prediction_id: number; scheme: string; canonical: string; payload_hash: string; prev_hash: string; chain_hash: string; committed_at: string }
export interface WitnessReceipt { id: number; chain_seq: number; chain_hash: string; service: string; status: "submitted" | "failed" | "upgraded"; receipt_path: string | null; detail: string | null; logged_at: string }

export function fmtNum(x: number): string {
  const s = x.toFixed(12).replace(/0+$/, "").replace(/\.$/, "");
  return s === "-0" || s === "" ? "0" : s;
}
export function fmtTs(s: string): string {
  const m = TS.exec(s);
  if (!m) throw new Error(`not a UTC timestamp: ${s}`);
  return `${m[1]}T${m[2]}.${(m[3] ?? "").padEnd(6, "0")}Z`;
}
export function canonical(row: Record<string, unknown>): string {
  const out: Record<string, string | null> = {};
  for (const f of [...FIELDS].sort()) {
    const v = row[f];
    out[f] = v === null || v === undefined ? null : TIME.has(f) ? fmtTs(String(v)) : typeof v === "number" && f !== "id" ? fmtNum(v) : String(v);
  }
  return JSON.stringify(out);
}
export const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
export const link = (prev: string, payload: string) => sha256(prev + payload);

/** Problems found (empty = verifies). Recomputes everything; never trusts a stored success flag. */
export function verifyChain(cs: Commitment[], preds?: Map<number, Record<string, unknown>>): string[] {
  const errs: string[] = [];
  let prev = ZERO;
  [...cs].sort((a, b) => a.seq - b.seq).forEach((c, i) => {
    if (c.seq !== i + 1) errs.push(`seq gap at ${c.seq}`);
    if (sha256(c.canonical) !== c.payload_hash) errs.push(`seq ${c.seq}: payload hash mismatch`);
    if (c.prev_hash !== prev || link(prev, c.payload_hash) !== c.chain_hash) errs.push(`seq ${c.seq}: chain link broken`);
    if (preds) {
      const p = preds.get(c.prediction_id);
      if (!p) errs.push(`seq ${c.seq}: prediction ${c.prediction_id} missing`);
      else if (canonical(p) !== c.canonical) errs.push(`seq ${c.seq}: prediction ${c.prediction_id} differs from its committed payload`);
    }
    prev = c.chain_hash;
  });
  return errs;
}

/** First successful witness submission = the date witnessing became active. Null = not active. */
export function witnessActiveSince(ws: WitnessReceipt[]): string | null {
  const ok = ws.filter((w) => w.status === "submitted").map((w) => w.logged_at).sort();
  return ok[0] ?? null;
}
/** Latest witnessed commitment seq covering a given seq, if any. */
export function witnessFor(seq: number, ws: WitnessReceipt[]): WitnessReceipt | null {
  return ws.filter((w) => w.status === "submitted" && w.chain_seq >= seq).sort((a, b) => a.chain_seq - b.chain_seq)[0] ?? null;
}
