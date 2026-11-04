import type { Metadata } from "next";
import { LineChart } from "@/components/Charts";
import { Stamp } from "@/components/Stamp";
import { getPredictions } from "@/lib/data";
import { signedPct } from "@/lib/format";
import { holdBtc, simulate } from "@/lib/portfolio";
import { DISCLAIMER } from "@/lib/summary";

export const revalidate = 300;
export const metadata: Metadata = { title: "Paper portfolio", description: "What $1,000 following every HOPIUM call since launch would be worth, after fees. Simulated." };

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="border-b border-rule pb-1">
      <dt className="label">{k}</dt>
      <dd className="text-[20px] text-ink">{v}</dd>
    </div>
  );
}

function Book({ title, note, s }: { title: string; note: string; s: ReturnType<typeof simulate> }) {
  const lo = Math.min(...s.curve.map((p) => p.v), 950);
  const hi = Math.max(...s.curve.map((p) => p.v), 1050);
  return (
    <section className="border-b border-rule py-8">
      <h2 className="display text-[34px] text-ink">{title}</h2>
      <p className="mt-1 text-[12px] text-faded">{note}</p>
      <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-5">
        <Stat k="value now" v={`$${s.value.toFixed(2)}`} />
        <Stat k="return" v={signedPct(s.ret)} />
        <Stat k="trades" v={String(s.trades.length)} />
        <Stat k="win rate" v={s.trades.length ? `${(s.winRate * 100).toFixed(1)}% (n = ${s.trades.length})` : "n/a"} />
        <Stat k="max drawdown" v={`${(s.maxDD * 100).toFixed(1)}%`} />
      </dl>
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
  const { data, error } = await getPredictions(20000);
  const ls = simulate(data, "long_short");
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
      <Book title="Every call, long and short" note="UP = simulated long, DOWN = simulated short." s={ls} />
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
