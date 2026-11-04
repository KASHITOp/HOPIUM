import type { Metadata } from "next";
import Lab from "./Lab";

export const metadata: Metadata = { title: "Lab", description: "Mix indicators, set thresholds and backtest on cached candles in your browser. Fees included, no lookahead." };

export default function LabPage() {
  return (
    <div className="py-10">
      <h1 className="display text-[52px] text-ink sm:text-[72px]">The lab.</h1>
      <p className="mt-3 max-w-2xl text-[14px] leading-6">Build your own signal from six classic indicators and backtest it on the last 90 days of hourly candles. It runs in your browser, in a background worker, with fees and without peeking at the future.</p>
      <div className="rule-thick mt-6 pt-6"><Lab /></div>
    </div>
  );
}
