import type { Metadata } from "next";
import Link from "next/link";
import engine from "@/lib/engine.json";
import { signedPct } from "@/lib/format";

export const metadata: Metadata = { title: "Case study", description: "HOPIUM in two minutes: problem, approach, architecture, decisions, honest results." };

const F = "var(--font-mono), monospace";

function Box({ x, y, w, h, title, lines }: { x: number; y: number; w: number; h: number; title: string; lines: string[] }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill="#1E1C18" stroke="#D6CEBD" strokeWidth="1.4" />
      <text x={x + 10} y={y + 20} fill="#D6CEBD" fontSize="13" fontWeight="700" fontFamily={F}>{title}</text>
      {lines.map((l, i) => (
        <text key={l} x={x + 10} y={y + 40 + i * 15} fill="#8F897C" fontSize="10.5" fontFamily={F}>{l}</text>
      ))}
    </g>
  );
}

function Arrow({ d, label, lx, ly }: { d: string; label?: string; lx?: number; ly?: number }) {
  return (
    <g>
      <path d={d} fill="none" stroke="#D6CEBD" strokeWidth="1.3" markerEnd="url(#arrowhead)" />
      {label && <text x={lx} y={ly} fill="#8F897C" fontSize="10" fontFamily={F}>{label}</text>}
    </g>
  );
}

function Architecture() {
  return (
    <svg viewBox="0 0 760 430" className="h-auto w-full" role="img" aria-labelledby="arch-t arch-d">
      <title id="arch-t">HOPIUM architecture</title>
      <desc id="arch-d">Public market data flows into hourly GitHub Actions jobs that predict and grade, write to Supabase Postgres, which the Next.js site on Vercel reads.</desc>
      <defs>
        <marker id="arrowhead" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill="#D6CEBD" />
        </marker>
      </defs>
      <Box x={10} y={20} w={220} h={120} title="PUBLIC DATA" lines={["Binance spot 1h candles", "Deribit funding", "Fear & Greed index", "(all reachable from US runners)"]} />
      <Box x={290} y={20} w={220} h={150} title="GITHUB ACTIONS" lines={["hourly: predict -> grade", "  skip if > 18 min late", "weekly: walk-forward check,", "  leakage gate, retrain", "ops output committed to git"]} />
      <Box x={290} y={240} w={220} h={170} title="SUPABASE POSTGRES" lines={["predictions (append-only)", "  insert <= 20 min after close", "  signal rule as CHECK", "  grade once, never edit", "run_log / model_runs", "RLS: public SELECT only"]} />
      <Box x={570} y={240} w={180} h={170} title="NEXT.JS ON VERCEL" lines={["read-only, anon key", "receipts, stats, lab", "Wilson CI, binomial test", "live tape = display only"]} />
      <Box x={570} y={20} w={180} h={120} title="RESEARCH (OFFLINE)" lines={["39 configs, nested", "walk-forward", "6-month holdout,", "used once"]} />
      <Arrow d="M230 80 H285" label="fetch" lx={243} ly={72} />
      <Arrow d="M400 170 V235" label="service key (secret)" lx={408} ly={207} />
      <Arrow d="M510 325 H565" label="read" lx={527} ly={317} />
      <Arrow d="M570 80 H515" label="model" lx={526} ly={72} />
      <Arrow d="M120 140 V325 H285" label="grading uses the same 1h closes" lx={20} ly={345} />
    </svg>
  );
}

export default function CaseStudy() {
  const wf = engine.walk_forward;
  return (
    <article className="max-w-3xl py-10 text-[14px] leading-7">
      <p className="label">case study, two minute read</p>
      <h1 className="display mt-2 text-[52px] text-ink sm:text-[72px]">Building a crypto model that is allowed to lose in public.</h1>

      <h2 className="display mt-10 text-[30px] text-ink">The problem</h2>
      <p>
        Crypto &quot;signal&quot; sellers show winners and quietly delete losers, so their track records mean nothing. I wanted to build the
        opposite: a forecaster whose every call is recorded before the outcome exists, graded automatically, and impossible to
        edit, so its real skill (or lack of it) is visible to anyone.
      </p>

      <h2 className="display mt-10 text-[30px] text-ink">The approach</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>Predict only moves big enough to pay trading fees: more than {engine.config.k * 100}% over {engine.config.h} hours, as a 3-class problem.</li>
        <li>Select models on net profit after 0.2% round-trip fees, not on accuracy.</li>
        <li>Walk-forward validation with thresholds chosen on inner folds; {engine.configs_tried} configs logged, losers included.</li>
        <li>A six-month holdout locked away in code and evaluated exactly once.</li>
        <li>Tests proving no feature can see the future, and that training labels, the live grader, the database and the site all grade identically.</li>
      </ul>

      <h2 className="display mt-10 text-[30px] text-ink">Architecture</h2>
      <div className="mt-4 border border-rule p-3"><Architecture /></div>

      <h2 className="display mt-10 text-[30px] text-ink">Decisions that mattered</h2>
      <ul className="mt-2 list-disc space-y-2 pl-5">
        <li><strong className="text-ink">Only live-reachable features.</strong> Binance futures data is geo-blocked from the US servers that run the jobs, so it was dropped even though it looked useful. Deribit funding answers from those servers, so it stayed, and removing it halved the walk-forward result.</li>
        <li><strong className="text-ink">The database enforces honesty.</strong> CHECK constraints and triggers reject late inserts, signals that break the published rule, edits, deletes and re-grading. Application bugs cannot fake a receipt.</li>
        <li><strong className="text-ink">Late means skipped.</strong> If the hourly job starts more than 18 minutes after the candle closes, it logs a missed run instead of predicting a past it can half-see.</li>
        <li><strong className="text-ink">Ship rules agreed before the holdout.</strong> Profitable on the holdout: ship as unproven. Not profitable: ship anyway, labelled as not beating fees. No moving the goalposts.</li>
      </ul>

      <h2 className="display mt-10 text-[30px] text-ink">Honest results</h2>
      <p>
        The first model was right 52.8% of the time and still lost 92.6% in simulation, because its edge was 15 times smaller than
        the fees. Retargeting to fee-sized moves produced a walk-forward result of {signedPct(wf["net_0.20%"], 1)} after fees over{" "}
        {wf.trades} trades (Sharpe {wf.sharpe!.toFixed(2)}, 95% CI {wf.sharpe_ci95![0]!.toFixed(2)} to {wf.sharpe_ci95![1]!.toFixed(2)}).
        The edge was concentrated in late 2024 and early 2025 and faded. On the locked holdout the model found nothing worth trading
        and made {engine.holdout.trades} trades. Label: <strong className="text-ink">{engine.label}</strong>
      </p>

      <h2 className="display mt-10 text-[30px] text-ink">What I would do next</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>Run an always-on collector for exchange funding and open interest so a real history exists to train on.</li>
        <li>Detect regimes from more than one market cycle before trusting any edge.</li>
        <li>Let the public track record run for months; it is the only result that cannot be overfit.</li>
      </ul>
      <p className="mt-8">
        <Link className="ink-link" href="/receipts">See the live receipts</Link> or read <Link className="ink-link" href="/how-it-works">how it works</Link>.
      </p>
    </article>
  );
}
