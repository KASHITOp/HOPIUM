import type { Metadata } from "next";
import { Legal } from "@/components/Legal";
import engine from "@/lib/engine.json";
import { DISCLAIMER } from "@/lib/summary";

export const metadata: Metadata = { title: "Disclaimer" };

export default function Disclaimer() {
  return (
    <Legal title="Disclaimer">
      <p className="border-2 border-ink p-4 text-ink">{DISCLAIMER}</p>
      <h2>Forecasts, not advice</h2>
      <p>
        HOPIUM publishes the output of a statistical model. A forecast is a guess with a number attached, and the model is wrong
        often. Nothing here tells you to buy, sell or hold anything, and nothing here is tailored to you.
      </p>
      <h2>What our own testing says</h2>
      <p>
        The current model is labelled &quot;{engine.label}&quot; In a walk-forward test it returned{" "}
        {(engine.walk_forward["net_0.20%"]! * 100).toFixed(1)}% after fees over {engine.walk_forward.trades} simulated trades, with a
        maximum drawdown of {(engine.walk_forward.max_dd! * 100).toFixed(1)}%. On six months of data it had never seen, it made{" "}
        {engine.holdout.trades} trades. Simulated results ignore slippage, funding costs, taxes and the fact that you would have
        needed to act within minutes, every time.
      </p>
      <h2>Short calls</h2>
      <p>
        A DOWN call is graded as if you had sold short. Shorting needs a derivatives or margin account, carries extra costs and can
        lose more than you put in. Spot-only traders can only act on UP calls.
      </p>
      <h2>Crypto risk</h2>
      <p>
        Crypto-assets are highly volatile and are unregulated or lightly regulated in many places, including India, where profits
        are taxed and losses get little protection. Exchanges can fail, freeze withdrawals or be hacked. Only risk money you can
        afford to lose completely.
      </p>
      <h2>No relationship with exchanges</h2>
      <p>
        We are not affiliated with any exchange or data provider, we earn nothing from your trading, and we do not link to
        exchanges.
      </p>
    </Legal>
  );
}
