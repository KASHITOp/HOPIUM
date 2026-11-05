import { canonical, SCHEME, sha256, verifyChain, witnessFor } from "@/lib/commit";
import { getChain, getCorrections, getPrediction, getRegistry } from "@/lib/data";
import { FEE_ROUND_TRIP, FLAT_THRESHOLD, grade, netReturn } from "@/lib/grading";
import { RULES } from "@/lib/outcomes";

export const dynamic = "force-dynamic";

const kline = (coin: string, closeIso: string) => {
  const open = Date.parse(closeIso) - 3600e3;
  return `https://data-api.binance.vision/api/v3/klines?symbol=${coin}USDT&interval=1h&startTime=${open}&limit=1`;
};

/** Machine-readable evidence bundle for one receipt. Check it with tools/verify_receipt.py (no credentials needed). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const [{ data: p, error, mode }, chain, reg, corr] = await Promise.all([getPrediction(id), getChain(), getRegistry(), getCorrections(id)]);
  if (error) return Response.json({ error: `database unreachable: ${error}` }, { status: 503 });
  if (!p) return Response.json({ error: "no such receipt" }, { status: 404 });
  const c = chain.data.commitments.find((x) => x.prediction_id === id) ?? null;
  const prefix = c ? chain.data.commitments.filter((x) => x.seq <= c.seq) : [];
  const row = p as unknown as Record<string, unknown>;
  const regraded = p.price_at_target !== null ? grade(p.signal, p.price_at_call, p.price_at_target) : null;
  const bundle = {
    bundle_version: "hopium-evidence-v1",
    generated_at: new Date().toISOString(),
    data_environment: mode === "mock" ? "DEMO (synthetic)" : "live database",
    prediction: p,
    model: reg.data.find((e) => e.model_version === p.model_version) ?? null,
    corrections: corr.data,
    corrections_policy: "Originals are never edited. Corrections are linked rows; published metrics use the ORIGINAL grades and list corrections beside them.",
    commitment: {
      scheme: SCHEME, status: chain.error ? `not configured (${chain.error})` : c ? "committed" : "not committed yet",
      canonical_recomputed: canonical(row), payload_hash_recomputed: sha256(canonical(row)),
      record: c, chain_prefix: prefix, chain_prefix_problems: verifyChain(prefix),
      witness: c ? witnessFor(c.seq, chain.data.witness) : null,
      witness_proof_base: "https://github.com/KASHITOp/HOPIUM/blob/main/",
    },
    grading: {
      rules: RULES, flat_threshold: FLAT_THRESHOLD, fee_round_trip: FEE_ROUND_TRIP,
      entry: { convention: "close of the Binance spot 1h candle ending at candle_close_time", stored: p.price_at_call, source: kline(p.coin, p.candle_close_time) },
      exit: { convention: "close of the Binance spot 1h candle ending at target_time", stored: p.price_at_target, source: kline(p.coin, p.target_time) },
      stored: { move: p.move, outcome: p.outcome, graded_at: p.graded_at },
      recomputed_from_stored_prices: regraded && { ...regraded, net_after_fees: netReturn(p.signal, regraded.move) },
    },
    proves: [
      "arithmetic: outcome and net follow from the two prices and the published rules (re-derivable from Binance)",
      "integrity: if committed, the payload matches its hash and the chain links recompute",
      "timing: only if witnessed, the chain head existed by the OpenTimestamps Bitcoin attestation",
    ],
    does_not_prove: [
      "inserted_at, generated_at and committed_at are the operator's own clocks unless covered by a witness",
      "nothing about rows before the chain started, or about withheld predictions that were never stored",
    ],
  };
  return new Response(JSON.stringify(bundle, null, 1), {
    headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="hopium-receipt-${id}-evidence.json"` },
  });
}
