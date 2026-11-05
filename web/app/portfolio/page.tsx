import type { Metadata } from "next";
import { LineChart } from "@/components/Charts";
import { Stamp } from "@/components/Stamp";
import { getCandles, getPredictions, MODE } from "@/lib/data";
import { EXEC_RULE, EXEC_RULE_TEXT, fill, indexCloses } from "@/lib/execution";
import { book, COST_SCENARIOS } from "@/lib/portfolio";
import { period } from "@/lib/provenance";
import { EnvLabel } from "@/components/Trust";
import { LocalTime } from "@/components/LocalTime";
import { signedPct } from "@/lib/format";
import { holdBtc, simulate } from "@/lib/portfolio";
import { DISCLAIMER } from "@/lib/summary";

export const dynamic = "force-dynamic"; // live data: never serve a build-time snapshot
export const metadata: Metadata = { title: "Paper portfolio", description: "What $1,000 following every HOPIUM call since launch would be worth, after fees. Simulated." };

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="border-b border-rule pb-1">
      <dt className="label">{k}</dt>
      <dd className="text-[20px] text-ink">{v}</dd>
    </div>
  );
}

function Book({ title, note, s }: { title: string; note: string; s: ReturnType<typeof book> }) {
  const lo = Math.min(...s.curve.map((p) => p.v), 950);
  const hi = Math.max(...s.curve.map((p) => p.v), 1050);
  return (
    <section className="border-b border-rule py-8">
      <h2 className="display text-[34px] text-ink">{title}</h2>
      <p className="mt-1 text-[12px] text-faded">{note}</p>
      <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-5">
        <Stat k="value now" v={`$${s.value.toFixed(2)}`} />
        <Stat k="portfolio return" v={signedPct(s.ret)} />
        <Stat k="trades" v={String(s.trades.length)} />
        <Stat k="win rate" v={s.trades.length ? `${(s.winRate * 100).toFixed(1)}% (n = ${s.trades.length})` : "n/a"} />
        <Stat k="max drawdown (at exits)" v={`${(s.maxDD * 100).toFixed(1)}%`} />
      </dl>
      <p className="mt-2 text-[12px] text-faded">Sum of individual trade returns: {signedPct(s.sumOfTradeReturns)} (not the same thing). Signals skipped because that coin already had an open trade: {s.skipped.length}.</p>
      <div className="mt-6">
        {s.trades.length ? (
          <LineChart points={s.curve} yMin={lo} yMax={hi} refY={1000} refLabel="$1,000 start" yFmt={(v) => `$${Math.round(v)}`} label={`${title} equity curve`} />
        ) : (
          <p className="text-faded">No completed trades yet. The model has mostly been sitting out, so the money has mostly been sitting still.</p>
        )}
      </div>
    </section>
  );
}

export default async function Portfolio() {
  const [{ data, error }, candles] = await Promise.all([getPredictions(20000), getCandles(90)]);
  const span = period(data);
  const ls = simulate(data, "long_short");
  const closes = indexCloses(candles.data);
  const fills = data.filter((r) => r.signal !== "NO_CALL").map((r) => fill(r, closes));
  const filled = fills.flatMap((f) => (f.status === "filled" ? [f] : []));
  const unavailable = fills.filter((f) => f.status === "unavailable" && f.reason !== "pending").length;
  const exec = book(filled, "long_short");
  const up = simulate(data, "up_only");
  const btc = holdBtc(data);
  const horizon = data[0]?.horizon ?? "12h";
  return (
    <div className="max-w-4xl py-10">
      <div className="flex flex-wrap items-center gap-6">
        <h1 className="display text-[52px] text-ink sm:text-[72px]">Paper portfolio.</h1>
        <Stamp kind="SAT OUT" seed={11} size="md" />
      </div>
      <p className="label mt-2">simulated. no real money. no real trades.</p>
      <EnvLabel mode={MODE} className="mt-1 block" />
      <p className="mt-1 text-[12px] text-faded">Period (reference closes): {span ? <><LocalTime iso={span.start} /> to <LocalTime iso={span.end} /></> : "no receipts yet"}.</p>
      <p className="mt-4 max-w-2xl text-[14px] leading-6">
        $1,000 split equally across BTC, ETH and SOL on the first live call, following every UP and DOWN call since then. Each
        trade is entered at the 1h close when the call is made and exited at the close {horizon} later, with 0.1% fees on the way in
        and on the way out, no leverage and one open trade per coin. Shorts assume a derivatives account; spot traders can only act
        on UP calls, so that version is shown too.
      </p>
      {error && (
        <p role="alert" className="mt-4 border border-red px-3 py-2 text-[13px] text-red">
          Database unreachable ({error}).
        </p>
      )}
      <section className="mt-6 border border-rule px-3 py-2 text-[12px] leading-5">
        <div className="label">accounting</div>
        <p>Three fixed sleeves of $333.33, never rebalanced; each trade uses its whole sleeve and compounds; one open trade per coin,
        later signals on that coin are skipped; shorts return minus the move with no borrow or funding cost; values are realized at
        exit with no mark-to-market. Hold-BTC uses the same reference closes from the first to the latest receipt.</p>
      </section>
      <Book title="Every call, long and short" note="Forecast-grading prices: entry at the reference close the forecast was computed from. That close was already in the past when the receipt was stored, so these are not fills anyone could have got." s={ls} />
      <Book title="Execution simulation, long and short" note={`Rule ${EXEC_RULE}: ${EXEC_RULE_TEXT}. Fees as above; slippage not added. ${unavailable} call(s) unavailable because the needed candles are outside the 90-day cache; they are left out, not filled at an earlier price.`} s={exec} />
      <section className="border-b border-rule py-8">
        <h2 className="display text-[28px] text-ink">Cost sensitivity (reference-close book)</h2>
        <p className="mt-1 text-[12px] text-faded">Scenarios only. The published figure above uses 0.2% round trip and does not change.</p>
        <table className="mt-3 w-full border-collapse text-[12px]">
          <tbody>
            {COST_SCENARIOS.map((c) => { const b = simulate(data, "long_short", 1000, c.costs); return (
              <tr key={c.name} className="border-b border-rule"><td className="py-1 pr-3">{c.name}</td><td>{signedPct(b.ret)}</td></tr>
            ); })}
          </tbody>
        </table>
      </section>
      <Book title="UP calls only" note="What a spot-only trader could actually have done." s={up} />
      <section className="py-8">
        <h2 className="display text-[34px] text-ink">Or just hold BTC</h2>
        {btc ? (
          <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            <Stat k="value now" v={`$${btc.value.toFixed(2)}`} />
            <Stat k="return" v={signedPct(btc.ret)} />
            <Stat k="max drawdown" v={`${(btc.maxDD * 100).toFixed(1)}%`} />
            <Stat k="fees" v="none after buying" />
          </dl>
        ) : (
          <p className="text-faded">Not enough history yet.</p>
        )}
      </section>
      <p className="text-[12px] text-faded">{DISCLAIMER} Simulated results ignore slippage, funding costs and taxes.</p>
    </div>
  );
}
