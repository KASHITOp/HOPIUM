import Link from "next/link";
import engine from "@/lib/engine.json";
import { WALK_FORWARD } from "@/lib/methodology";
import { liveOnly, period, provenanceOf, PROVENANCE_LABEL } from "@/lib/provenance";
import type { Mode } from "@/lib/data";
import type { Prediction, RunLog } from "@/lib/types";
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
export function TrustPanel({ rows, runs, mode, error }: { rows: Prediction[]; runs: RunLog[]; mode: Mode; error: string | null }) {
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
        <Row k="prediction runs, last 30 days" v={mode === "mock" ? "demo" : `${ok} ok, ${missed} skipped late, ${err} failed. Per-slot coverage ledger: not built yet.`} />
        <Row k="backtest headline" v={<>+{(WALK_FORWARD.figure * 100).toFixed(1)}% is a compounded 3-sleeve simulation at reference closes; holdout made {engine.holdout.trades} trades. <Link className="ink-link" href="/how-it-works#method">method</Link></>} />
        <Row k="timestamps" v="insert and grading times come from the database clock; generation times are the job's own report. None are independently witnessed." />
        <Row k="independent witnessing" v="not configured. Integrity rests on database rules the operator could still change." warn />
        <Row k="verification" v="each receipt shows its inputs and arithmetic; CSV has every row. A standalone verifier is planned, not built." />
        <Row k="known limitations" v="edge faded in 2026 (most hours NO CALL); late cron runs are skipped; fills, slippage and funding are not modelled in the backtest." />
      </dl>
    </section>
  );
}
