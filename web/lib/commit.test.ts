import { describe, expect, it } from "vitest";
import { canonical, Commitment, fmtNum, fmtTs, link, sha256, verifyChain, witnessActiveSince, witnessFor, ZERO } from "./commit";

const ROW = { id: 7, coin: "BTC", horizon: "12h", signal: "NO_CALL", prob_up: 0.123456, p_big_up: 0.123456, p_big_down: 0.2,
  score: -0.076544, threshold: 0.16, k: 0.01, price_at_call: 70123.45, candle_close_time: "2026-11-05T14:00:00+00:00",
  target_time: "2026-11-06T02:00:00+00:00", inserted_at: "2026-11-05T14:03:12.12345+00:00", model_version: "v3-12h-logreg-20261104",
  provenance: "live_prospective", job_started_at: null, input_cutoff_at: null, generated_at: null, run_id: null, late_rule: null };

function chain(rows: Record<string, unknown>[]): Commitment[] {
  let prev = ZERO;
  return rows.map((r, i) => {
    const c = canonical(r), ph = sha256(c), ch = link(prev, ph);
    const out = { seq: i + 1, prediction_id: r.id as number, scheme: "hopium-pred-v1", canonical: c, payload_hash: ph, prev_hash: prev, chain_hash: ch, committed_at: "" };
    prev = ch;
    return out;
  });
}

describe("hopium-pred-v1", () => {
  it("matches the Python implementation (shared vector from ml/tests/test_commit.py)", () => {
    expect(sha256(canonical(ROW))).toBe("f4a733f92289e87ce0320a429155a37a2168ad431de9d90a3d53c01b69708989");
  });
  it("formats numbers and times deterministically", () => {
    expect(fmtNum(0.16)).toBe("0.16"); expect(fmtNum(100)).toBe("100"); expect(fmtNum(-0)).toBe("0"); expect(fmtNum(1e-7)).toBe("0.0000001");
    expect(fmtTs("2026-11-05 14:03:12.12345+00")).toBe("2026-11-05T14:03:12.123450Z");
    expect(() => fmtTs("2026-11-05T14:00:00+05:30")).toThrow();
  });
  it("verifies an honest chain and catches edits, deletions, reordering and duplicates", () => {
    const rows = [ROW, { ...ROW, id: 8, coin: "ETH" }, { ...ROW, id: 9, coin: "SOL" }] as [typeof ROW, typeof ROW, typeof ROW];
    const c = chain(rows) as [Commitment, Commitment, Commitment];
    const m = new Map(rows.map((r) => [r.id, r as Record<string, unknown>]));
    expect(verifyChain(c, m)).toEqual([]);
    expect(verifyChain(c, new Map(m).set(8, { ...rows[1], signal: "UP" }))).not.toEqual([]);
    expect(verifyChain(c.map((x, i) => (i === 1 ? { ...x, canonical: x.canonical.replace("ETH", "BTC") } : x)))).not.toEqual([]);
    expect(verifyChain([c[0], c[2]])).not.toEqual([]);
    expect(verifyChain([c[0], { ...c[2], seq: 2 }])).not.toEqual([]);
    expect(verifyChain([c[0], { ...c[0], seq: 2 }])).not.toEqual([]);
  });
  it("witness activation is the first successful submission; failures never count", () => {
    const w = (id: number, seq: number, status: "submitted" | "failed", at: string) => ({ id, chain_seq: seq, chain_hash: "", service: "opentimestamps", status, receipt_path: null, detail: null, logged_at: at });
    expect(witnessActiveSince([w(1, 3, "failed", "2026-11-05T10:00:00Z")])).toBeNull();
    const ws = [w(1, 3, "failed", "2026-11-05T10:00:00Z"), w(2, 3, "submitted", "2026-11-05T11:00:00Z"), w(3, 9, "submitted", "2026-11-05T12:00:00Z")];
    expect(witnessActiveSince(ws)).toBe("2026-11-05T11:00:00Z");
    expect(witnessFor(5, ws)?.chain_seq).toBe(9);
    expect(witnessFor(10, ws)).toBeNull();
  });
});
