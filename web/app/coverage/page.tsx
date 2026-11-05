import type { Metadata } from "next";
import Link from "next/link";
import { LocalTime } from "@/components/LocalTime";
import { EnvLabel } from "@/components/Trust";
import { gaps, ledger, SCHEDULE, STATE_LABEL, summary, type SlotState } from "@/lib/coverage";
import { getPredictions, getRunLog, MODE } from "@/lib/data";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Coverage", description: "Every scheduled HOPIUM slot since launch, and what happened to it." };

export default async function CoveragePage() {
  const [{ data: preds, error }, runs] = await Promise.all([getPredictions(20000), getRunLog(3650)]);
  const slots = ledger(preds, runs.data);
  const m = summary(slots);
  const g = gaps(slots).reverse();
  const recent = slots.slice(-72 * 3).reverse();
  return (
    <div className="py-10 text-[14px] leading-7">
      <h1 className="display text-[48px] text-ink">Coverage ledger</h1>
      <EnvLabel mode={MODE} />
      {error && <p role="alert" className="text-red">Database unreachable ({error}). Coverage cannot be computed right now.</p>}
      <p className="mt-3 max-w-[70ch]">
        The schedule ({SCHEDULE.version}) expects one prediction per coin ({SCHEDULE.coins.join(", ")}) at every UTC hour close,
        starting at the first live reference close{slots[0] ? <> (<LocalTime iso={slots[0].close} />)</> : ""}. Every expected slot is
        listed with what happened to it. Missing slots are never backfilled. Coverage says whether the machine showed up, not whether it was right.
        No planned maintenance has been declared.
      </p>
      {!slots.length ? <p className="mt-6">No live predictions yet, so there is no schedule to account for.</p> : (
        <>
          <dl className="mt-6 grid gap-x-6 sm:grid-cols-4">
            <div><dt className="label">expected slots (settled)</dt><dd className="text-ink">{m.expected}</dd></div>
            <div><dt className="label">published</dt><dd className="text-ink">{m.published}</dd></div>
            <div><dt className="label">coverage</dt><dd className={m.pct !== null && m.pct < 0.9 ? "text-red" : "text-ink"}>{m.pct === null ? "n/a" : `${(m.pct * 100).toFixed(1)}%`}</dd></div>
            <div><dt className="label">insert latency (median / max)</dt><dd className="text-ink">{m.latencyMedian === null ? "n/a" : `${m.latencyMedian.toFixed(1)} / ${m.latencyMax!.toFixed(1)} min`}</dd></div>
          </dl>
          <table className="mt-4 text-[12px]"><tbody>
            {(Object.keys(STATE_LABEL) as SlotState[]).map((k) => (
              <tr key={k} className="border-b border-rule"><td className="pr-4 text-faded">{STATE_LABEL[k]}</td><td className="text-ink">{m.counts[k]}</td></tr>
            ))}
          </tbody></table>
          <p className="mt-2 text-[12px] text-faded">Latency = database insert time minus reference close (database clock). Late starts are skipped by rule late-v1, then logged.</p>

          <h2 className="display mt-10 text-[30px] text-ink">Missing intervals and incidents</h2>
          {!g.length ? <p>None.</p> : (
            <table className="mt-2 w-full border-collapse text-[12px]"><thead><tr className="label text-left"><th>from</th><th>to</th><th>slots</th><th>state</th><th>reason</th></tr></thead><tbody>
              {g.map((x) => (
                <tr key={x.start + x.state} className="border-b border-rule align-top">
                  <td className="py-1 pr-3"><LocalTime iso={x.start} /></td><td className="pr-3"><LocalTime iso={x.end} /></td>
                  <td className="pr-3">{x.slots}</td><td className="pr-3 text-red">{STATE_LABEL[x.state]}</td><td className="text-faded">{x.reason}</td>
                </tr>
              ))}
            </tbody></table>
          )}
          <p className="mt-2 text-[12px] text-faded">
            Known incident: from 16:02 UTC on 2026-11-04 the self-dispatching scheduler chain died and GitHub&apos;s own cron fired only
            a few times, late, so roughly 20 hours had no job or a skipped late job. Root cause and fix are in{" "}
            <a className="ink-link" href="https://github.com/KASHITOp/HOPIUM/blob/main/REVIEW.md">REVIEW.md</a>. Those slots stay missing.
          </p>

          <h2 className="display mt-10 text-[30px] text-ink">Last 72 hours, slot by slot</h2>
          <table className="mt-2 w-full border-collapse text-[12px]"><tbody>
            {recent.map((s) => (
              <tr key={s.coin + s.close} className="border-b border-rule">
                <td className="py-0.5 pr-3"><LocalTime iso={s.close} /></td><td className="pr-3">{s.coin}</td>
                <td className={`pr-3 ${s.predictionId ? "text-ink" : "text-red"}`}>{STATE_LABEL[s.state]}</td>
                <td>{s.predictionId ? <Link className="ink-link" href={`/r/${s.predictionId}`}>#{s.predictionId}</Link> : <span className="text-faded">{s.reason}</span>}</td>
              </tr>
            ))}
          </tbody></table>
        </>
      )}
    </div>
  );
}
