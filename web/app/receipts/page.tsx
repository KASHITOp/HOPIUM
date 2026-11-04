import type { Metadata } from "next";
import Link from "next/link";
import { CalibrationChart, LineChart } from "@/components/Charts";
import { ModelLabel } from "@/components/Chrome";
import { JamIcon } from "@/components/Icons";
import { LocalTime } from "@/components/LocalTime";
import { Receipt } from "@/components/Receipt";
import { stampFor } from "@/components/Stamp";
import { getPredictions, getRunLog } from "@/lib/data";
import { applyFilters, BANDS, parseFilters } from "@/lib/filters";
import { price, signedPct } from "@/lib/format";
import { netReturn } from "@/lib/grading";
import { calibrationBins, luckSentence, pctCeil, pctFloor } from "@/lib/stats";
import { hitStreaks, lean, rollingHitRate, tally, wallOfShame } from "@/lib/summary";

export const revalidate = 60;
export const metadata: Metadata = { title: "Receipts", description: "Every HOPIUM prediction, graded in public, with the statistics to judge it." };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}
const input = "border border-rule bg-slip px-2 py-1 text-[13px] text-ink";

export default async function Receipts({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const f = parseFilters(searchParams);
  const [{ data: all, error }, runs] = await Promise.all([getPredictions(20000), getRunLog(3650)]);
  const rows = applyFilters(all, f);
  const t = tally(rows);
  const graded = rows.filter((r) => r.outcome !== null);
  const k = graded.find((r) => r.k !== null)?.k ?? 0.01;
  const cal = [
    ...calibrationBins(graded.map((r) => r.p_big_up ?? r.prob_up), graded.map((r) => (r.move ?? 0) > k)).map((b) => ({ ...b, kind: "up" as const })),
    ...calibrationBins(graded.filter((r) => r.p_big_down !== null).map((r) => r.p_big_down!), graded.filter((r) => r.p_big_down !== null).map((r) => (r.move ?? 0) < -k)).map((b) => ({ ...b, kind: "down" as const })),
  ];
  const roll = rollingHitRate(rows, 20);
  const firstDue = rows.filter((r) => r.outcome === null).map((r) => r.target_time).sort()[0] ?? null;
  const st = hitStreaks(rows);
  const shame = wallOfShame(rows, 10);
  const jams = runs.data.filter((r) => r.job === "predict" && r.status === "missed");
  const jams7 = jams.filter((r) => Date.parse(r.logged_at) > Date.now() - 7 * 86400e3).length;
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v && v !== "all") as [string, string][]).toString();
  const horizons = [...new Set(all.map((r) => r.horizon))];

  return (
    <div className="py-10">
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div>
          <h1 className="display text-[56px] text-ink sm:text-[80px]">The receipts.</h1>
          <p className="mt-3 max-w-2xl text-[14px] leading-6">
            Every prediction since launch. Rows are inserted before the outcome exists and the database refuses edits and
            deletes, so the embarrassing ones stay. Hit rate counts only graded UP and DOWN calls; FLAT moves (under 0.1%),
            NO CALL hours and pending calls are counted separately and never mixed in.
          </p>
        </div>
        <ModelLabel className="self-end" />
      </div>

      <form className="mt-8 flex flex-wrap items-end gap-4 border-y border-rule py-4" method="get" aria-label="Filter receipts">
        <Field label="coin">
          <select name="coin" defaultValue={f.coin} className={input}>
            {["all", "BTC", "ETH", "SOL"].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="horizon">
          <select name="horizon" defaultValue={f.horizon} className={input}>
            {["all", ...horizons].map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
        </Field>
        <Field label="from"><input type="date" name="from" defaultValue={f.from} className={input} /></Field>
        <Field label="to"><input type="date" name="to" defaultValue={f.to} className={input} /></Field>
        <Field label="confidence (lean)">
          <select name="band" defaultValue={f.band} className={input}>
            {BANDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <button className="border border-ink px-4 py-1.5 text-[13px] text-ink hover:underline">Apply</button>
        <Link href="/receipts" className="ink-link text-[13px]">reset</Link>
        <a href={`/receipts/csv${qs ? `?${qs}` : ""}`} className="ink-link ml-auto text-[13px]">download CSV ({rows.length} rows)</a>
      </form>

      {error && <p role="alert" className="mt-4 border border-red px-3 py-2 text-[13px] text-red">Database unreachable ({error}). No numbers shown are cached or invented.</p>}

      <section className="grid gap-8 border-b border-rule py-8 md:grid-cols-[1.4fr_1fr]" aria-label="Hit rate">
        <div>
          <div className="label">hit rate on graded calls</div>
          <div className="display mt-2 text-[72px] text-ink">{t.calls ? pctFloor(t.hitRate) : "n/a"}</div>
          <p className="text-[13px]">
            {t.calls ? <>95% Wilson interval {pctFloor(t.ci.lo)} to {pctCeil(t.ci.hi)}, n = {t.calls} ({t.hits} hits, {t.misses} misses)</> : "No graded calls in this selection yet."}
          </p>
          <p className="mt-3 max-w-lg text-[15px] leading-6 text-ink">{luckSentence(t.hits, t.calls)}</p>
          <p className="mt-2 max-w-lg text-[12px] leading-5 text-faded">
            That is a one-sided exact binomial test against a 50% coin flip. A small number here means luck is an unlikely
            explanation, not that the model makes money: fees take 0.2% from every trade.
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 self-end text-[13px]">
          {[
            ["hits", t.hits], ["misses", t.misses], ["dead money (flat)", t.flat], ["sat out (no call)", t.satOut],
            ["pending", t.pending], ["longest hit streak", st.longestHit], ["longest miss streak", st.longestMiss],
            ["current streak", st.currentKind ? `${st.current} ${st.currentKind}${st.current === 1 ? "" : st.currentKind === "hit" ? "s" : "es"}` : "n/a"],
          ].map(([k2, v]) => (
            <div key={String(k2)} className="border-b border-rule pb-1">
              <dt className="label">{k2}</dt>
              <dd className="text-[20px] text-ink">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      {graded.length === 0 ? (
        <section className="border-b border-rule py-10" aria-label="Waiting for the first grade">
          <h2 className="display text-[30px] text-ink">Nothing graded yet.</h2>
          {firstDue ? (
            <p className="mt-2 max-w-2xl text-[14px] leading-6">
              The first receipts grade at <LocalTime iso={firstDue} /> your time, when the Binance 1h candle ending then closes and the
              next hourly job compares it with the entry price. Charts appear here once there is something honest to draw.
            </p>
          ) : (
            <p className="mt-2 text-[14px]">No predictions in this selection yet.</p>
          )}
        </section>
      ) : (
      <section className="grid gap-8 border-b border-rule py-8 md:grid-cols-[1.5fr_1fr]">
        <div>
          <h2 className="display text-[30px] text-ink">Rolling hit rate</h2>
          <p className="mb-3 text-[12px] text-faded">last 20 graded calls at each point. Dashed line: coin flip.</p>
          <LineChart points={roll} refY={0.5} refLabel="coin flip 50%" label="Rolling hit rate over the last 20 graded calls" />
        </div>
        <div>
          <h2 className="display text-[30px] text-ink">Calibration</h2>
          <p className="mb-3 text-[12px] text-faded">
            circles: P(big up) vs how often the move beat +{(k * 100).toFixed(0)}%. squares: same for big down. On the dashed line means honest probabilities.
          </p>
          {graded.length >= 20 ? (
            <CalibrationChart bins={cal} label="Calibration of predicted big-move probabilities" />
          ) : (
            <p className="text-[13px] text-faded">Needs at least 20 graded predictions (n = {graded.length}).</p>
          )}
        </div>
      </section>

      )}
      <section className="grid gap-6 border-b border-rule py-8 md:grid-cols-[auto_1fr]" aria-label="Printer jams">
        <JamIcon size={40} className="text-ink" />
        <div>
          <h2 className="display text-[30px] text-ink">Printer jammed {jams.length} {jams.length === 1 ? "time" : "times"}.</h2>
          <p className="mt-1 max-w-2xl text-[13px] leading-6">
            When the hourly job starts more than 18 minutes after the candle closes we skip that hour instead of predicting a
            past we can already half-see. Skipped hours are never backfilled. {jams7} in the last 7 days.
          </p>
        </div>
      </section>

      <section className="py-8" aria-labelledby="shame">
        <h2 id="shame" className="display text-[44px] text-ink">Wall of Shame</h2>
        <p className="mt-1 text-[13px]">The 10 most confident calls that went the wrong way. Model was sure. Model was wrong. We printed it anyway.</p>
        {shame.length === 0 ? (
          <p className="mt-4 text-faded">No wrong calls yet. Give it time.</p>
        ) : (
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {shame.map((p) => <Receipt key={p.id} p={p} compact />)}
          </div>
        )}
      </section>

      <section className="py-8" aria-labelledby="ledger">
        <h2 id="ledger" className="display text-[36px] text-ink">The ledger</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-[12px]">
            <caption className="sr-only">All receipts in this selection, newest first</caption>
            <thead>
              <tr className="border-y-2 border-ink text-left">
                {["#", "called", "coin", "h", "call", "lean", "entry", "exit", "move", "after fees", "verdict"].map((h) => (
                  <th key={h} scope="col" className="label py-2 pr-3 font-normal">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 100).map((r) => (
                <tr key={r.id} className="border-b border-rule">
                  <td className="py-1.5 pr-3"><Link className="ink-link" href={`/r/${r.id}`}>{r.id}</Link></td>
                  <td className="pr-3"><LocalTime iso={r.candle_close_time} /></td>
                  <td className="pr-3">{r.coin}</td>
                  <td className="pr-3">{r.horizon}</td>
                  <td className={`pr-3 ${r.signal === "UP" ? "text-green" : r.signal === "DOWN" ? "text-red" : "text-faded"}`}>{r.signal === "NO_CALL" ? "no call" : r.signal}</td>
                  <td className="pr-3">{(lean(r) * 100).toFixed(1)}%</td>
                  <td className="pr-3">{price(r.price_at_call)}</td>
                  <td className="pr-3">{r.price_at_target !== null ? price(r.price_at_target) : ""}</td>
                  <td className="pr-3">{signedPct(r.move)}</td>
                  <td className="pr-3">{r.move !== null && r.signal !== "NO_CALL" ? signedPct(netReturn(r.signal, r.move)) : ""}</td>
                  <td className="pr-3">{stampFor(r.outcome).toLowerCase()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 100 && <p className="mt-2 text-[12px] text-faded">Showing 100 of {rows.length}. The CSV has every row.</p>}
          {rows.length === 0 && <p className="mt-4 text-faded">No receipts match these filters.</p>}
        </div>
      </section>
    </div>
  );
}
