import Link from "next/link";
import { ModelLabel } from "@/components/Chrome";
import { Countdown } from "@/components/Countdown";
import { EnvLabel, TrustPanel, WalkForwardMethod } from "@/components/Trust";
import { MODE } from "@/lib/data";
import { PrinterIcon } from "@/components/Icons";
import { LocalTime } from "@/components/LocalTime";
import { Meter } from "@/components/Meter";
import { Receipt, ReceiptSkeleton } from "@/components/Receipt";
import { SitOutPanel, Watched } from "@/components/SitOut";
import { getPredictions, getRunLog } from "@/lib/data";
import engine from "@/lib/engine.json";
import { price } from "@/lib/format";
import { DISCLAIMER, historicConfident, lastDays, lean, tally } from "@/lib/summary";
import type { Coin, Prediction } from "@/lib/types";
import { pctFloor } from "@/lib/stats";

export const revalidate = 60;

const COINS: Coin[] = ["BTC", "ETH", "SOL"];

function Headline({ rows }: { rows: Prediction[] }) {
  const t = tally(lastDays(rows, 30));
  if (t.calls < 30) {
    return (
      <p className="display text-[34px] text-ink sm:text-[52px]">
        Last 30 days: not enough graded calls yet. <span className="text-faded">(n = {t.calls}, we wait for 30)</span>
      </p>
    );
  }
  return (
    <p className="display text-[34px] text-ink sm:text-[52px]">
      Last 30 days: {pctFloor(t.hitRate)} correct vs 50% coin flip <span className="text-faded">(n = {t.calls})</span>
    </p>
  );
}

function sitOutLine(rows: Prediction[]): string | null {
  const hours = [...new Set(rows.map((r) => r.candle_close_time))].slice(0, 24);
  if (hours.length < 6) return null;
  const quiet = hours.filter((h) => rows.filter((r) => r.candle_close_time === h).every((r) => r.signal === "NO_CALL")).length;
  if (quiet === hours.length) return `The model sat out all of the last ${hours.length} hours. Discipline or cowardice? You decide.`;
  if (quiet > hours.length / 2) return `The model sat out ${quiet} of the last ${hours.length} hours. Discipline or cowardice? You decide.`;
  return `The model made a call in ${hours.length - quiet} of the last ${hours.length} hours.`;
}

function CoinRow({ coin, p, historic }: { coin: Coin; p: Prediction | undefined; historic: { k: number; n: number } }) {
  return (
    <section className="grid gap-6 border-b border-rule py-8 md:grid-cols-[150px_1fr_300px]" aria-labelledby={`h-${coin}`}>
      <div>
        <h2 id={`h-${coin}`} className="display text-[64px] text-ink">{coin}</h2>
        <div className="label mt-2">next {engine.config.h}h</div>
      </div>
      {p ? (
        <div className="grid gap-6 sm:grid-cols-[auto_1fr]">
          <Meter lean={lean(p)} direction={(p.score ?? 0) < 0 ? "down" : "up"} historic={historic} threshold={p.threshold ?? engine.threshold} />
          <div className="text-[13px] leading-6">
            <div className="label">current call</div>
            <div className={`display text-[44px] ${p.signal === "UP" ? "text-green" : p.signal === "DOWN" ? "text-red" : "text-faded"}`}>
              {p.signal === "NO_CALL" ? "NO CALL" : p.signal}
            </div>
            <div>entry ${price(p.price_at_call)} <span className="text-faded">(1h close at <LocalTime iso={p.candle_close_time} />)</span></div>
            <div>grading in <span className="text-ink"><Countdown to={p.target_time} /></span></div>
            <p className="mt-3 text-[11px] text-faded">{DISCLAIMER}</p>
          </div>
        </div>
      ) : (
        <p className="self-center text-faded">No prediction for {coin} yet. The printer is warming up.</p>
      )}
      <div>{p ? <Receipt p={p} compact /> : <ReceiptSkeleton />}</div>
    </section>
  );
}

export default async function Home() {
  const [{ data: rows, error }, runs] = await Promise.all([getPredictions(20000), getRunLog(3650)]);
  const missed = runs.data.filter((r) => r.job === "predict" && r.status === "missed").length;
  const latest = new Map<Coin, Prediction>();
  for (const r of rows) if (!latest.has(r.coin)) latest.set(r.coin, r);
  const historic = historicConfident(rows);
  const feed = rows.slice(0, 12);
  const sitOut = sitOutLine(rows);

  return (
    <>
      <section className="grid gap-6 py-10 lg:grid-cols-[1fr_320px]">
        <div>
          <Headline rows={rows} />
          <p className="mt-5 max-w-2xl text-[14px] leading-6 text-ink">
            Every hour a model looks at BTC, ETH and SOL and decides whether a move big enough to pay trading fees is coming in the
            next {engine.config.h} hours. The call is written to the database before the outcome exists, then graded against the
            real Binance close. Wins and losses stay up. Mostly it says nothing, and we print that too.
          </p>
        </div>
        <aside className="self-end space-y-3">
          <ModelLabel />
          <p className="text-[12px] leading-5 text-faded">
            Backtest (walk-forward simulation): +{(engine.walk_forward["net_0.20%"]! * 100).toFixed(1)}% compounded across three equal
            coin sleeves after 0.2% fees, {engine.walk_forward.trades} trades, entry at reference closes, best of {engine.configs_tried} configs.
            Locked 6-month holdout: {engine.holdout.trades} trades. <Link className="ink-link" href="/how-it-works">Why that matters</Link>
          </p>
          <WalkForwardMethod />
          <EnvLabel mode={MODE} />
        </aside>
      </section>

      {error && (
        <p role="alert" className="border border-red px-3 py-2 text-[13px] text-red">
          The receipt printer cannot reach the database right now ({error}). Nothing below is cached or invented.
        </p>
      )}

      <div className="rule-thick" />
      <Watched rows={rows} missed={missed} />
      <SitOutPanel latest={latest} threshold={engine.threshold} />
      {COINS.map((c) => (
        <CoinRow key={c} coin={c} p={latest.get(c)} historic={historic} />
      ))}

      <section className="pt-12" aria-labelledby="feed">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="feed" className="display flex items-center gap-3 text-[40px] text-ink">
            <PrinterIcon size={30} /> The printer
          </h2>
          <Link href="/receipts" className="ink-link text-[13px]">every receipt, with the maths</Link>
        </div>
        {sitOut && <p className="mt-2 text-[14px] text-ink">{sitOut}</p>}
        <div className="rule mt-4" />
        {feed.length === 0 ? (
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => <ReceiptSkeleton key={i} />)}
            <p className="text-faded sm:col-span-2 lg:col-span-4">Nothing printed yet. The first receipt appears after the next hourly run.</p>
          </div>
        ) : (
          <div className="mt-6 columns-1 gap-6 sm:columns-2 lg:columns-4 [&>*]:mb-6 [&>*]:break-inside-avoid">
            {feed.map((p, i) => (
              <Receipt key={p.id} p={p} printing={i === 0} compact />
            ))}
          </div>
        )}
      </section>
      <div className="pt-12">
        <TrustPanel rows={rows} runs={runs.data.filter((r) => Date.parse(r.logged_at) > Date.now() - 30 * 86400e3)} mode={MODE} error={error} />
      </div>
    </>
  );
}
