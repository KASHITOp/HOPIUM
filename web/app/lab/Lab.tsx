"use client";
import { useEffect, useRef, useState } from "react";
import { LineChart } from "@/components/Charts";
import { WarningIcon } from "@/components/Icons";
import { ReceiptSkeleton } from "@/components/Receipt";
import { type Bar, decodeStrategy, encodeStrategy, INDICATORS, type Indicator, type Strategy } from "@/lib/backtest";
import { DISCLAIMER } from "@/lib/summary";

const NAMES: Record<Indicator, [string, string]> = {
  rsi: ["RSI (14)", "oversold reads bullish"],
  macd: ["MACD histogram", "momentum turning up reads bullish"],
  ema: ["EMA cross (20/50)", "fast above slow reads bullish"],
  bbands: ["Bollinger %B", "below the lower band reads bullish"],
  vwap: ["VWAP distance", "below 24h VWAP reads bullish"],
  supertrend: ["Supertrend (10, 3)", "uptrend reads bullish"],
};

type Res = { totalReturn: number; holdReturn: number; sharpe: number; maxDD: number; winRate: number; trades: number; equity: { t: number; v: number }[]; hold: { t: number; v: number }[] };

export default function Lab() {
  const [coin, setCoin] = useState("BTC");
  const [s, setS] = useState<Strategy | null>(null);
  const [bars, setBars] = useState<Bar[] | null>(null);
  const [mode, setMode] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);
  const [res, setRes] = useState<Res | null>(null);
  const worker = useRef<Worker | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const d = decodeStrategy(new URLSearchParams(window.location.search));
    setS(d.s);
    setCoin(d.coin);
    worker.current = new Worker(new URL("../../lib/backtest.worker.ts", import.meta.url));
    worker.current.onmessage = (e) => { if (e.data.seq === seq.current) setRes(e.data.r); };
    return () => worker.current?.terminate();
  }, []);

  useEffect(() => {
    setBars(null);
    fetch(`/lab/candles?coin=${coin}`).then((r) => r.json()).then((j) => { setBars(j.bars); setMode(j.mode); setErr(j.error); })
      .catch((e) => setErr(String(e)));
  }, [coin]);

  useEffect(() => {
    if (!s || !bars || !worker.current) return;
    window.history.replaceState(null, "", `?${encodeStrategy(s, coin)}`);
    seq.current += 1;
    worker.current.postMessage({ bars, s, seq: seq.current });
  }, [s, bars, coin]);

  if (!s) return <ReceiptSkeleton />;
  const set = (patch: Partial<Strategy>) => setS({ ...s, ...patch });
  const pct = (x: number) => (Number.isFinite(x) ? `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(1)}%` : "n/a");

  return (
    <div className="grid gap-8 lg:grid-cols-[340px_1fr]">
      <form className="space-y-4" aria-label="Strategy settings" onSubmit={(e) => e.preventDefault()}>
        <fieldset className="flex gap-2">
          <legend className="label mb-2">coin</legend>
          {["BTC", "ETH", "SOL"].map((c) => (
            <button key={c} type="button" aria-pressed={coin === c} onClick={() => setCoin(c)}
              className={`border px-3 py-1 text-[13px] ${coin === c ? "border-ink text-ink underline" : "border-rule text-faded hover:text-ink"}`}>{c}</button>
          ))}
        </fieldset>
        {INDICATORS.map((k) => (
          <label key={k} className="block">
            <span className="flex justify-between text-[13px]"><span className="text-ink">{NAMES[k][0]}</span><span>{s.weights[k].toFixed(2)}</span></span>
            <input type="range" min={-1} max={1} step={0.05} value={s.weights[k]} className="w-full accent-[#D6CEBD]"
              onChange={(e) => set({ weights: { ...s.weights, [k]: Number(e.target.value) } })} aria-label={`${NAMES[k][0]} weight`} />
            <span className="text-[11px] text-faded">{NAMES[k][1]}; a negative weight flips it</span>
          </label>
        ))}
        <div className="rule pt-3" />
        <label className="block">
          <span className="flex justify-between text-[13px]"><span className="text-ink">Act when score beyond</span><span>{s.enter.toFixed(2)}</span></span>
          <input type="range" min={0} max={0.95} step={0.01} value={s.enter} className="w-full accent-[#D6CEBD]" onChange={(e) => set({ enter: Number(e.target.value) })} />
        </label>
        <label className="block">
          <span className="flex justify-between text-[13px]"><span className="text-ink">Hold for</span><span>{s.hold}h</span></span>
          <input type="range" min={1} max={72} step={1} value={s.hold} className="w-full accent-[#D6CEBD]" onChange={(e) => set({ hold: Number(e.target.value) })} />
        </label>
        <label className="block">
          <span className="flex justify-between text-[13px]"><span className="text-ink">Fee per side</span><span>{(s.fee * 100).toFixed(2)}%</span></span>
          <input type="range" min={0} max={0.003} step={0.0001} value={s.fee} className="w-full accent-[#D6CEBD]" onChange={(e) => set({ fee: Number(e.target.value) })} />
        </label>
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={s.shorts} onChange={(e) => set({ shorts: e.target.checked })} /> allow shorts (needs a derivatives account)
        </label>
        <p className="text-[11px] text-faded">The URL updates as you go. Copy it to share this exact strategy.</p>
      </form>

      <section aria-live="polite">
        {err && <p role="alert" className="mb-3 border border-red px-3 py-2 text-[13px] text-red">Candles unavailable ({err}).</p>}
        {!bars || !res ? (
          <ReceiptSkeleton lines={9} />
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
              {[
                ["your strategy", pct(res.totalReturn)], [`holding ${coin}`, pct(res.holdReturn)], ["trades", String(res.trades)],
                ["win rate", res.trades ? `${(res.winRate * 100).toFixed(1)}% (n = ${res.trades})` : "n/a"],
                ["Sharpe (annualised)", Number.isFinite(res.sharpe) ? res.sharpe.toFixed(2) : "n/a"], ["max drawdown", `${(res.maxDD * 100).toFixed(1)}%`],
              ].map(([k, v]) => (
                <div key={k} className="border-b border-rule pb-1"><dt className="label">{k}</dt><dd className="text-[20px] text-ink">{v}</dd></div>
              ))}
            </dl>
            {res.trades < 30 && (
              <p className="mt-4 flex items-start gap-2 border border-red px-3 py-2 text-[13px] text-red">
                <WarningIcon size={18} /> Only {res.trades} trades. That is too few to tell a strategy from a lucky streak.
              </p>
            )}
            <div className="mt-6">
              <div className="label mb-2">$1,000 on the same scale. top: your strategy. bottom: just holding. {bars.length} hourly candles{mode === "mock" ? ", DEMO candles" : ""}</div>
              <LineChart points={res.equity} yMin={Math.min(...res.equity.map((p) => p.v), ...res.hold.map((p) => p.v)) * 0.98}
                yMax={Math.max(...res.equity.map((p) => p.v), ...res.hold.map((p) => p.v)) * 1.02} refY={1000} refLabel="$1,000"
                yFmt={(v) => `$${Math.round(v)}`} label="Strategy equity curve" />
              <LineChart points={res.hold} yMin={Math.min(...res.equity.map((p) => p.v), ...res.hold.map((p) => p.v)) * 0.98}
                yMax={Math.max(...res.equity.map((p) => p.v), ...res.hold.map((p) => p.v)) * 1.02} refY={1000} yFmt={(v) => `$${Math.round(v)}`} label={`Holding ${coin}`} />
            </div>
            <p className="mt-4 text-[12px] leading-5 text-faded">
              In-sample on the last 90 days. Wiggle sliders long enough and a beautiful curve appears; that is overfitting with your
              eyes, and it is exactly what our own model had to be protected from. Signals use only candles up to the moment of the
              trade, entries and exits use 1h closes, fees are charged both ways. {DISCLAIMER}
            </p>
          </>
        )}
      </section>
    </div>
  );
}
