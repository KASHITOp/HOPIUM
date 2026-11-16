import { CalibrationChart } from "@/components/Charts";
import {
  BASELINE_RULE, BOOT, BOOT_RULE, BRIER_RULE, CAL, EPISODE_RULE, NONOVERLAP_RULE, baselines, bootstrapSummary, brier, byVersion,
  callHitRate, clusterEpisodes, episodeHitRate, nonOverlapping, probRows, reliability,
} from "@/lib/evidence";
import { signedPct } from "@/lib/format";
import { pctCeil, pctFloor } from "@/lib/stats";
import type { Prediction } from "@/lib/types";

const pp = (x: number) => (Number.isFinite(x) ? signedPct(x) : "n/a");
const f3 = (x: number) => (Number.isFinite(x) ? x.toFixed(4) : "n/a");

function Rule({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 max-w-3xl text-[12px] leading-5 text-faded">{children}</p>;
}

/** WS6: robustness checks shown beside the original per-call numbers. Nothing here replaces a stored grade. */
export function Evidence({ all, rows }: { all: Prediction[]; rows: Prediction[] }) {
  const perCall = callHitRate(rows);
  const ep = episodeHitRate(clusterEpisodes(all).episodes, rows);
  const no = callHitRate(nonOverlapping(rows));
  const boot = bootstrapSummary(rows);
  const base = baselines(all, rows);
  const line = (label: string, h: { n: number; rate: number; lo: number; hi: number }, unit: string) => (
    <tr className="border-b border-rule">
      <th scope="row" className="py-1.5 pr-4 text-left font-normal">{label}</th>
      <td className="pr-4 text-ink">{h.n ? pctFloor(h.rate) : "n/a"}</td>
      <td className="pr-4">{h.n ? `${pctFloor(h.lo)} to ${pctCeil(h.hi)}` : ""}</td>
      <td className="pr-4">{h.n} {unit}</td>
    </tr>
  );
  return (
    <section className="border-b border-rule py-8" aria-labelledby="robust">
      <h2 id="robust" className="display text-[30px] text-ink">How much evidence is this, really?</h2>
      <p className="mt-2 max-w-3xl text-[13px] leading-6">
        Every hour makes a fresh 12h call, so consecutive calls share most of their window, and BTC, ETH and SOL usually move
        together. The call count is not a count of independent tests. These robustness checks sit next to the original
        per-call number; none of them changes a stored grade.
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-[12px]">
          <caption className="sr-only">Hit rate under different counting rules</caption>
          <thead><tr className="border-y-2 border-ink text-left">{["counting rule", "hit rate", "95% interval", "sample"].map((h) => <th key={h} scope="col" className="label py-2 pr-4 font-normal">{h}</th>)}</tr></thead>
          <tbody>
            {line("every call (original, Wilson)", perCall, "calls")}
            {line("by episode (Wilson)", ep, "episodes")}
            {line("00:00 and 12:00 UTC only (Wilson)", no, "calls")}
            <tr className="border-b border-rule">
              <th scope="row" className="py-1.5 pr-4 text-left font-normal">every call, block bootstrap</th>
              {boot.insufficient ? <td colSpan={3} className="text-faded">insufficient data: {boot.graded} graded calls, needs {BOOT.minCalls}</td> : <>
                <td className="pr-4 text-ink">{pctFloor(boot.hit.point)}</td><td className="pr-4">{pctFloor(boot.hit.lo)} to {pctCeil(boot.hit.hi)}</td><td className="pr-4">{boot.graded} calls, {boot.hit.draws} draws</td></>}
            </tr>
          </tbody>
        </table>
      </div>
      <Rule>Episodes: {EPISODE_RULE}</Rule>
      <Rule>Schedule: {NONOVERLAP_RULE}</Rule>
      <Rule>Bootstrap: {BOOT_RULE} The bootstrap only knows about time; the Wilson rows assume independence and are too narrow.</Rule>

      <h3 className="display mt-8 text-[22px] text-ink">Simulated return per call, after fees</h3>
      {boot.insufficient ? (
        <p className="mt-2 text-[13px] text-faded">Insufficient data: {boot.graded} graded calls, needs {BOOT.minCalls} before an interval means anything.</p>
      ) : (
        <p className="mt-2 text-[13px]">Mean {pp(boot.net.point)} per call, 95% block-bootstrap interval {pp(boot.net.lo)} to {pp(boot.net.hi)} (reference-close entry and exit, 0.2% round trip, same bootstrap as above). If the interval crosses zero, the record cannot tell this apart from losing money.</p>
      )}

      <h3 className="display mt-8 text-[22px] text-ink">Against dumb baselines</h3>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-[12px]">
          <caption className="sr-only">Model against baselines on the same rows</caption>
          <thead><tr className="border-y-2 border-ink text-left">{["strategy", "hit rate", "95% Wilson", "flat", "mean net / call"].map((h) => <th key={h} scope="col" className="label py-2 pr-4 font-normal">{h}</th>)}</tr></thead>
          <tbody>
            {base.map((b) => (
              <tr key={b.name} className="border-b border-rule">
                <th scope="row" className="py-1.5 pr-4 text-left font-normal">{b.name}</th>
                <td className="pr-4 text-ink">{b.hr.n ? pctFloor(b.hr.rate) : "n/a"}</td>
                <td className="pr-4">{b.hr.n ? `${pctFloor(b.hr.lo)} to ${pctCeil(b.hr.hi)}` : ""}</td>
                <td className="pr-4">{b.hr.flat}</td>
                <td className="pr-4">{pp(b.meanNet)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Rule>{BASELINE_RULE} n = {base[0]!.trades} calls. Same overlap caveat: the Wilson intervals here are too narrow for all three rows.</Rule>
    </section>
  );
}

/** WS7: probability reporting for the events the model actually predicts. */
export function Probabilities({ all, rows }: { all: Prediction[]; rows: Prediction[] }) {
  const kinds = [["big_up", "P(big up)", "move above +1%"], ["big_down", "P(big down)", "move below -1%"]] as const;
  const data = kinds.map(([k, label, ev]) => {
    const pr = probRows(rows, k), allPr = probRows(all, k);
    return { k, label, ev, pr, bins: reliability(pr), b: brier(pr, allPr), versions: byVersion(pr, allPr) };
  });
  const total = data[0]!.pr.length;
  const enough = total >= CAL.minTotal;
  const chartBins = data.flatMap((d) => d.bins.filter((b) => b.enough).map((b) => ({ ...b, kind: d.k === "big_up" ? ("up" as const) : ("down" as const) })));
  return (
    <section className="border-b border-rule py-8" aria-labelledby="probs">
      <h2 id="probs" className="display text-[30px] text-ink">Are the probabilities any good?</h2>
      <p className="mt-2 max-w-3xl text-[13px] leading-6">
        The model prints two probabilities every hour, NO CALL hours included: P(big up), that the 12h move ends above +1%, and
        P(big down), that it ends below -1%. These are checked against what happened on every graded hour, using the stored
        probabilities. No recalibration has been fitted on these outcomes, so this is the untouched live record.
      </p>
      {!enough ? (
        <p className="mt-4 border border-rule px-3 py-2 text-[13px]">Insufficient data: {total} graded hours, the charts need {CAL.minTotal}. Anything drawn from fewer would be a story, not a measurement.</p>
      ) : (
        <div className="mt-4 grid gap-8 md:grid-cols-[340px_1fr]">
          <div>
            <CalibrationChart bins={chartBins} label="Reliability of P(big up) and P(big down)" />
            <p className="mt-1 text-[12px] text-faded">circles: P(big up). squares: P(big down). Only bins with at least {CAL.minBin} hours are drawn.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse text-[12px]">
              <caption className="sr-only">Reliability bins with sample counts</caption>
              <thead><tr className="border-y-2 border-ink text-left">{["event", "bin", "hours", "model said", "happened"].map((h) => <th key={h} scope="col" className="label py-2 pr-3 font-normal">{h}</th>)}</tr></thead>
              <tbody>
                {data.flatMap((d) => d.bins.map((b) => (
                  <tr key={`${d.k}-${b.lo}`} className="border-b border-rule">
                    <td className="py-1 pr-3">{d.label}</td><td className="pr-3">{Math.round(b.lo * 100)} to {Math.round(b.hi * 100)}%</td><td className="pr-3">{b.n}</td>
                    <td className="pr-3">{(b.predicted * 100).toFixed(1)}%</td>
                    <td className="pr-3">{b.enough ? `${(b.actual * 100).toFixed(1)}%` : <span className="text-faded">too few</span>}</td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <h3 className="display mt-8 text-[22px] text-ink">Brier score against the base rate</h3>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-[12px]">
          <caption className="sr-only">Brier scores by event and model version</caption>
          <thead><tr className="border-y-2 border-ink text-left">{["event", "model version", "hours", "model", "base rate", "skill"].map((h) => <th key={h} scope="col" className="label py-2 pr-3 font-normal">{h}</th>)}</tr></thead>
          <tbody>
            {data.flatMap((d) => [
              <tr key={d.k} className="border-b border-rule">
                <td className="py-1 pr-3">{d.label}</td><td className="pr-3">all versions</td><td className="pr-3">{d.b.n}</td>
                {d.b.insufficient ? <td colSpan={3} className="text-faded">insufficient data (needs {CAL.minTotal})</td> : <><td className="pr-3 text-ink">{f3(d.b.model)}</td><td className="pr-3">{f3(d.b.baseline)}</td><td className="pr-3">{f3(d.b.skill)}</td></>}
              </tr>,
              ...d.versions.map((v) => (
                <tr key={`${d.k}-${v.version}`} className="border-b border-rule text-faded">
                  <td className="py-1 pr-3">{d.label}</td><td className="pr-3">{v.version}</td><td className="pr-3">{v.brier.n}</td>
                  {v.brier.insufficient ? <td colSpan={3}>insufficient data (needs {CAL.minVersion})</td> : <><td className="pr-3">{f3(v.brier.model)}</td><td className="pr-3">{f3(v.brier.baseline)}</td><td className="pr-3">{f3(v.brier.skill)}</td></>}
                </tr>
              )),
            ])}
          </tbody>
        </table>
      </div>
      <Rule>{BRIER_RULE} Hourly 12h windows overlap, so these hours are not independent either; no interval is printed for Brier yet.</Rule>
    </section>
  );
}
