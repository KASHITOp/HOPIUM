import Link from "next/link";
import engine from "@/lib/engine.json";
import { WALK_FORWARD } from "@/lib/methodology";
import { liveOnly, period, provenanceOf, PROVENANCE_LABEL } from "@/lib/provenance";
import type { Mode } from "@/lib/data";
import type { Prediction, RunLog } from "@/lib/types";
import { ledger, summary } from "@/lib/coverage";
import { verifyChain, witnessActiveSince, type Commitment, type WitnessReceipt } from "@/lib/commit";
import { LocalTime } from "./LocalTime";

/** Persistent data-environment label. Shown on every result surface. */
export function EnvLabel({ mode, className = "" }: { mode: Mode; className?: string }) {
  return mode === "mock" ? (
    <span className={`label text-red ${className}`}>data: DEMO, synthetic numbers and timestamps</span>
  ) : (
    <span className={`label ${className}`}>data: live database, read-only</span>
  );
}

/** Methodology beside the walk-forward headline. */
export function WalkForwardMethod({ open = false }: { open?: boolean }) {
  return (
    <details open={open} className="mt-2 border border-rule px-3 py-2 text-[12px] leading-5">
      <summary className="cursor-pointer text-ink">What {(WALK_FORWARD.figure * 100).toFixed(1)}% means, exactly</summary>
      <p className="mt-2 text-faded">Backtest simulation, {WALK_FORWARD.period}.</p>
      <ul className="mt-1 list-disc space-y-1 pl-4">
        {WALK_FORWARD.lines.map((l) => <li key={l}>{l}</li>)}
      </ul>
    </details>
  );
}

function Row({ k, v, warn }: { k: string; v: React.ReactNode; warn?: boolean }) {
  return (
    <div className="border-b border-rule py-1.5">
      <dt className="label">{k}</dt>
      <dd className={`text-[13px] ${warn ? "text-red" : "text-ink"}`}>{v}</dd>
    </div>
  );
}

/** Compact "Trust and limitations" summary. States what is implemented, and what is not. */
export interface ChainState { commitments: Commitment[]; witness: WitnessReceipt[]; error: string | null }

/** Witness + chain status in words. Distinguishes not configured, failing and active; never implies old rows were witnessed. */
export function chainStatus(c: ChainState | undefined, mode: Mode, rows: Prediction[]) {
  if (mode === "mock") return { chain: "demo deployment: no chain", witness: "demo deployment: not configured", warn: true };
  if (!c || c.error) return { chain: "not configured (trust-v2 tables not reachable)", witness: "not configured. Integrity rests on database rules the operator could still change.", warn: true };
  const errs = verifyChain(c.commitments, new Map(rows.map((r) => [r.id, r as unknown as Record<string, unknown>])));
  const first = c.commitments[0]?.committed_at;
  const since = witnessActiveSince(c.witness);
  const fails = c.witness.filter((w) => w.status === "failed").length;
  const chain = !c.commitments.length ? "configured, no commitments yet"
    : `${c.commitments.length} receipts hashed and chained since ${first?.slice(0, 16).replace("T", " ")} UTC; recomputed on this page: ${errs.length ? `${errs.length} problems (${errs[0]})` : "all hashes and links match"}. Rows stored before that were chained when the feature started, not when they were made.`;
  const witness = since
    ? `OpenTimestamps, active since ${since.slice(0, 16).replace("T", " ")} UTC. Proves the chain head existed by the attested Bitcoin block; nothing before that date was witnessed.${fails ? ` ${fails} failed attempts logged (retried hourly).` : ""}`
    : fails ? `configured (OpenTimestamps) but every attempt so far failed (${fails} logged). Not active.` : "configured (OpenTimestamps), first stamp pending. Not active yet.";
  return { chain, witness, warn: !since || errs.length > 0 };
}

export function TrustPanel({ rows, runs, mode, error, chain, allRuns }: { rows: Prediction[]; runs: RunLog[]; mode: Mode; error: string | null; chain?: ChainState; allRuns?: RunLog[] }) {
  const cs = chainStatus(chain, mode, rows);
  const cov = summary(ledger(mode === "mock" ? [] : liveOnly(rows), allRuns ?? runs));
  const live = mode === "mock" ? [] : liveOnly(rows);
  const span = period(live);
  const labelled = live.filter((r) => provenanceOf(r) === "live_prospective").length;
  const predict = runs.filter((r) => r.job === "predict");
  const ok = predict.filter((r) => r.status === "ok").length, missed = predict.filter((r) => r.status === "missed").length, err = predict.filter((r) => r.status === "error").length;
  return (
    <section aria-labelledby="trust" className="border-y-2 border-ink py-6">
      <h2 id="trust" className="display text-[30px] text-ink">Trust and limitations</h2>
      <dl className="mt-3 grid gap-x-6 sm:grid-cols-2">
        <Row k="data environment" v={mode === "mock" ? "DEMO. Nothing on this deployment is a real prediction." : error ? `live, but unreachable now (${error})` : "live database"} warn={mode === "mock" || !!error} />
        <Row k="live tracking period (reference closes, UTC)" v={span ? <><LocalTime iso={span.start} /> to <LocalTime iso={span.end} /></> : "no live receipts yet"} />
        <Row k="provenance" v={live.length ? `${labelled} labelled ${PROVENANCE_LABEL.live_prospective}; ${live.length - labelled} ${PROVENANCE_LABEL.legacy_live}` : "n/a"} />
        <Row k="current model" v={`${engine.version} (threshold ${engine.threshold})`} />
        <Row k="publication coverage" v={mode === "mock" ? "demo" : cov.pct === null ? "no live slots yet" : <>{(cov.pct * 100).toFixed(1)}% of {cov.expected} expected coin-hour slots since launch published; {cov.expected - cov.published} missing, each with a reason (last 30 days of jobs: {ok} ok, {missed} skipped late, {err} failed). <Link className="ink-link" href="/coverage">ledger</Link></>} warn={cov.pct !== null && cov.pct < 0.9} />
        <Row k="backtest headline" v={<>+{(WALK_FORWARD.figure * 100).toFixed(1)}% is a compounded 3-sleeve simulation at reference closes; holdout made {engine.holdout.trades} trades. <Link className="ink-link" href="/how-it-works#method">method</Link></>} />
        <Row k="timestamps" v="insert and grading times come from the database clock; generation times are the job's own report. None are independently witnessed." />
        <Row k="hash chain" v={cs.chain} warn={cs.warn && !chain?.commitments.length} />
        <Row k="independent witnessing" v={cs.witness} warn={cs.warn} />
        <Row k="verification" v={<>each receipt has a Verify section, a downloadable evidence bundle and a standalone verifier (tools/verify_receipt.py, no credentials). Challenges go through GitHub issues; corrections are new linked records.</>} />
        <Row k="known limitations" v="edge faded in 2026 (most hours NO CALL); late cron runs are skipped; fills, slippage and funding are not modelled in the backtest." />
      </dl>
    </section>
  );
}
