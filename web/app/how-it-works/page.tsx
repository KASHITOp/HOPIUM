import type { Metadata } from "next";
import Link from "next/link";
import { MonthBars } from "@/components/Charts";
import { LocalTime } from "@/components/LocalTime";
import { getModelRuns, getRunLog } from "@/lib/data";
import engine from "@/lib/engine.json";
import { signedPct } from "@/lib/format";

export const revalidate = 300;
export const metadata: Metadata = { title: "How it works", description: "Data, features, validation, the honest result, and what HOPIUM cannot do." };

const wf = engine.walk_forward;
const pc = (x: number | null | undefined, d = 1) => (x === null || x === undefined ? "n/a" : `${(x * 100).toFixed(d)}%`);

function H2({ id, children }: { id?: string; children: React.ReactNode }) {
  return <h2 id={id} className="display mt-14 border-t-2 border-ink pt-4 text-[38px] text-ink">{children}</h2>;
}

const SOURCES: [string, string, string][] = [
  ["Binance spot 1h candles", "data-api.binance.vision", "Live. Every price the model sees, every entry and every exit."],
  ["Deribit perpetual funding", "deribit.com public API", "Live. What leveraged traders pay to hold positions, hourly."],
  ["Fear & Greed index", "alternative.me", "Live. Yesterday's value only, so it is always already published."],
  ["Coinbase candles", "Coinbase Exchange", "Backup for rebuilding history. Never used for live calls or grading."],
  ["Binance futures (funding, open interest)", "fapi.binance.com", "Not used. Geo-blocked (HTTP 451) from the US servers that run the model."],
  ["Bybit", "api.bybit.com", "Not used. Blocked (HTTP 403) from the same servers."],
];

export default async function How() {
  const [runs, models] = await Promise.all([getRunLog(30), getModelRuns()]);
  const lastOk = runs.data.find((r) => r.job === "predict" && r.status === "ok");
  const lastGrade = runs.data.find((r) => r.job === "grade" && r.status === "ok");
  const missed7 = runs.data.filter((r) => r.job === "predict" && r.status === "missed" && Date.parse(r.logged_at) > Date.now() - 7 * 86400e3).length;
  const errors7 = runs.data.filter((r) => r.status === "error" && Date.parse(r.logged_at) > Date.now() - 7 * 86400e3).length;
  const months = engine.folds.map((f) => ({ month: f.month, v: f.net_sum, trades: f.trades }));

  return (
    <article className="max-w-3xl py-10 text-[14px] leading-7">
      <h1 className="display text-[56px] text-ink sm:text-[80px]">How it works.</h1>
      <p className="mt-4 border-2 border-ink p-4 text-[15px] leading-6 text-ink">
        Honest headline: <strong>{engine.label}</strong> In walk-forward testing the model beat fees. On six months of data it had
        never seen, it found nothing worth trading and made {engine.holdout.trades} trades. We publish its calls anyway, because a
        public record is the only test that cannot be tuned after the fact.
      </p>

      <H2>What it predicts</H2>
      <p>
        Every hour, for BTC, ETH and SOL, the model estimates two probabilities: that the price ends the next {engine.config.h} hours
        more than {engine.config.k * 100}% higher (P(big up)) and more than {engine.config.k * 100}% lower (P(big down)). A move that small would be eaten
        by fees, so smaller moves count as nothing happening. The call is UP when P(big up) minus P(big down) is above{" "}
        {engine.threshold}, DOWN when it is below minus {engine.threshold}, and NO CALL otherwise. The Hopium Meter shows that
        difference as a lean from 50% to 100%; it is not a probability.
      </p>
      <p className="mt-3">
        Entry is the close of the last finished Binance 1h candle when the call is made. Exit is the close of the candle that
        ends {engine.config.h} hours later. A call is a hit if the price moved its way, and dead money if it moved less than
        0.1% either way. The live price ticker on the site is decoration and is never used for grading.
      </p>

      <H2>Where the data comes from</H2>
      <table className="mt-4 w-full border-collapse text-[12px] leading-5">
        <thead>
          <tr className="border-b-2 border-ink text-left"><th className="label py-2 font-normal">source</th><th className="label font-normal">host</th><th className="label font-normal">use</th></tr>
        </thead>
        <tbody>
          {SOURCES.map(([a, b, c]) => (
            <tr key={a} className="border-b border-rule align-top"><td className="py-2 pr-3 text-ink">{a}</td><td className="pr-3 text-faded">{b}</td><td>{c}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-faded">
        The rule: a number can only be a model input if the hourly job can fetch it live, every hour, from where it runs. A
        feature that exists in training but is stale or missing in production makes the backtest a lie.
      </p>

      <H2>What it looks at</H2>
      <p>
        Recent returns (1 to 168 hours), RSI, MACD, ATR, Bollinger %B, distance from VWAP, volume and trade-count surprises, the
        share of volume from aggressive buyers, distance from daily and weekly highs and lows, realised volatility and its
        percentile, how ETH and SOL move relative to BTC, funding rates, Fear &amp; Greed, hour, weekday and trading session. A
        test changes every future candle, funding value and index reading at random and checks that no past feature moves by
        even one bit.
      </p>

      <H2>How it was tested</H2>
      <p>
        Walk-forward only: train on the past, test on the next unseen month, roll forward, {engine.folds.length} months in total
        ({wf.dev_period}). Inside each training window the last 90 days choose the trade threshold, so the test month never
        helps pick anything. {engine.configs_tried} configurations were tried and every one is logged, including the losers.
        The most recent six months were locked away before any of that and used exactly once, on the single chosen config.
      </p>
      <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        {[
          ["walk-forward trades", String(wf.trades)],
          ["net after 0.2% fees", signedPct(wf["net_0.20%"], 1)],
          ["Sharpe (95% CI)", `${wf.sharpe!.toFixed(2)} (${wf.sharpe_ci95![0]!.toFixed(2)} to ${wf.sharpe_ci95![1]!.toFixed(2)})`],
          ["max drawdown", pc(wf.max_dd)],
          ["win rate", pc(wf.win_rate)],
          ["avg win / loss", `${signedPct(wf.avg_win)} / ${signedPct(wf.avg_loss)}`],
          ["holdout trades", String(engine.holdout.trades)],
          ["holdout net", signedPct(engine.holdout["net_0.20%"], 1)],
        ].map(([k, v]) => (
          <div key={k} className="border-b border-rule pb-1"><dt className="label">{k}</dt><dd className="text-[18px] text-ink">{v}</dd></div>
        ))}
      </dl>
      <div className="mt-8">
        <div className="label mb-2">walk-forward, sum of net trade returns per test month after 0.2% fees (simulated; dot = no trades)</div>
        <MonthBars months={months} label="Walk-forward net return per test month" />
        <p className="text-[12px] text-faded">Nearly all of the gain came between December 2024 and April 2025. From January 2026 the model mostly declined to trade.</p>
      </div>

      <H2>Why fees eat the edge</H2>
      <p>
        The first version tried to call every up or down move. It was right {pc(engine.old_model.accuracy)} of the time over{" "}
        {engine.old_model.n.toLocaleString("en-US")} hours, which is a real edge. But the average trade earned{" "}
        {pc(engine.old_model.edge_per_trade_before_fees, 3)} before fees, and buying and selling costs 0.2%. Following it lost{" "}
        {pc(-engine.old_model.sim_return_after_fees)} of the money in simulation. Being right slightly more often than a coin is
        easy. Being right by more than the toll booth charges is the whole game.
      </p>

      <H2>Why 55% is good and 90% is a lie</H2>
      <p>
        Short-term crypto prices are close to a random walk. Anyone claiming 90% accuracy is grading after the fact, counting
        only the calls they like, or leaking tomorrow into today. Our own rule: if a backtest ever scores above 65%, we assume a
        bug and stop. An honest model lives between 51% and 57%, and even that is only useful if the wins are bigger than the
        fees.
      </p>

      <H2>What it cannot do</H2>
      <p>
        It knows nothing about news, hacks, regulation, ETF flows or anyone&apos;s tweets. It has seen about three years of one
        market cycle. Its edge in testing came from one stretch of 2024 and 2025 and faded. It never trades, never holds your
        money and never tells you how much to bet. If you act on a call, that is your decision and your risk.
      </p>

      <H2 id="status">Status</H2>
      <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <div className="border-b border-rule pb-1"><dt className="label">model version</dt><dd className="text-ink">{engine.version}</dd></div>
        <div className="border-b border-rule pb-1"><dt className="label">last retrain</dt><dd className="text-ink">{models.data[0] ? <LocalTime iso={models.data[0].trained_at} /> : <LocalTime iso={engine.built_at} />}</dd></div>
        <div className="border-b border-rule pb-1"><dt className="label">last successful prediction run</dt><dd className="text-ink">{lastOk ? <LocalTime iso={lastOk.logged_at} /> : "none yet"}</dd></div>
        <div className="border-b border-rule pb-1"><dt className="label">last grading run</dt><dd className="text-ink">{lastGrade ? <LocalTime iso={lastGrade.logged_at} /> : "none yet"}</dd></div>
        <div className="border-b border-rule pb-1"><dt className="label">missed runs, last 7 days</dt><dd className="text-ink">{missed7}</dd></div>
        <div className="border-b border-rule pb-1"><dt className="label">errors, last 7 days</dt><dd className="text-ink">{errors7}</dd></div>
      </dl>
      {runs.error && <p className="mt-3 text-red">Status unavailable: {runs.error}</p>}
      <p className="mt-8">
        Full numbers, every configuration and the code: <a className="ink-link" href="https://github.com/KASHITOp/HOPIUM/blob/main/ml/RESULTS.md">RESULTS.md</a>.
        Or read the <Link className="ink-link" href="/case-study">two-minute case study</Link>.
      </p>
    </article>
  );
}
