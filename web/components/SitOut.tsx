import type { Coin, Prediction } from "@/lib/types";

const F = "var(--font-mono), monospace";

export function closeness(score: number, threshold: number): string {
  const r = Math.abs(score) / threshold;
  if (r > 1) return "Over the line. That is a call.";
  if (r >= 0.75) return "Almost.";
  if (r >= 0.4) return "Getting warmer.";
  return "Not even close.";
}

export function sitOutLine(coin: Coin, score: number, threshold: number): string {
  const s = `${score >= 0 ? "+" : "−"}${Math.abs(score).toFixed(2)}`;
  if (Math.abs(score) > threshold) return `${coin} lean ${s}. Cleared ${threshold.toFixed(2)}, so it made a call.`;
  return `${coin} lean ${s}. Needs ${threshold.toFixed(2)} to call. ${closeness(score, threshold)}`;
}

/** Horizontal printed gauge: -0.4 .. +0.4, call lines at +/- threshold, a tick for the current lean. */
function Gauge({ score, threshold, label }: { score: number; threshold: number; label: string }) {
  const W = 300, H = 46, L = 10, R = 10, M = 0.4;
  const x = (v: number) => L + ((Math.max(-M, Math.min(M, v)) + M) / (2 * M)) * (W - L - R);
  const id = `so-${label}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full max-w-[320px]" role="img" aria-label={`${label}: lean ${score.toFixed(3)}, call threshold ${threshold}`}>
      <defs>
        <pattern id={id} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="5" stroke="#3A362E" strokeWidth="2" />
        </pattern>
      </defs>
      {/* no-call zone, hatched */}
      <rect x={x(-threshold)} y={10} width={x(threshold) - x(-threshold)} height={14} fill={`url(#${id})`} stroke="#3A362E" />
      <line x1={L} x2={W - R} y1={17} y2={17} stroke="#8F897C" />
      {[-threshold, threshold].map((t) => (
        <g key={t}>
          <line x1={x(t)} x2={x(t)} y1={6} y2={28} stroke="#D4614C" strokeDasharray="3 2" />
          <text x={x(t)} y={40} textAnchor="middle" fontSize="9" fill="#D4614C" fontFamily={F}>{t > 0 ? "+" : "−"}{threshold.toFixed(2)}</text>
        </g>
      ))}
      <text x={x(0)} y={40} textAnchor="middle" fontSize="9" fill="#8F897C" fontFamily={F}>0</text>
      <text x={L} y={40} fontSize="9" fill="#8F897C" fontFamily={F}>down</text>
      <text x={W - R} y={40} textAnchor="end" fontSize="9" fill="#8F897C" fontFamily={F}>up</text>
      {/* current lean */}
      <path d={`M${x(score)} 4 l-5 -4 h10 z`} fill="#D6CEBD" />
      <line x1={x(score)} x2={x(score)} y1={4} y2={30} stroke="#D6CEBD" strokeWidth="2.2" />
    </svg>
  );
}

export function SitOutPanel({ latest, threshold }: { latest: Map<Coin, Prediction>; threshold: number }) {
  const rows = (["BTC", "ETH", "SOL"] as Coin[]).map((c) => latest.get(c)).filter((p): p is Prediction => !!p && p.score !== null);
  if (!rows.length) return null;
  const allQuiet = rows.every((p) => p.signal === "NO_CALL");
  return (
    <section className="border-b border-rule py-8" aria-labelledby="sitout">
      <h2 id="sitout" className="display text-[34px] text-ink">{allQuiet ? "Why it’s sitting out" : "How close each coin is"}</h2>
      <p className="mt-1 max-w-2xl text-[13px] leading-6">
        The model only calls when P(big up) minus P(big down) clears {threshold.toFixed(2)} either way. Inside the hatched band it stays
        quiet, because in testing smaller leans did not pay for the 0.2% in fees.
      </p>
      <div className="mt-5 grid gap-6 md:grid-cols-3">
        {rows.map((p) => (
          <div key={p.coin}>
            <Gauge score={p.score!} threshold={p.threshold ?? threshold} label={p.coin} />
            <p className="mt-1 text-[13px] text-ink">{sitOutLine(p.coin, p.score!, p.threshold ?? threshold)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function Watched({ rows, missed }: { rows: Prediction[]; missed: number }) {
  if (!rows.length) return null;
  const hours = new Set(rows.map((r) => r.candle_close_time)).size;
  const calls = rows.filter((r) => r.signal !== "NO_CALL").length;
  const first = rows.reduce((a, r) => (r.candle_close_time < a ? r.candle_close_time : a), rows[0]!.candle_close_time);
  return (
    <div className="border-b border-rule py-6">
    <dl className="grid grid-cols-3 gap-4" aria-label="Activity since launch">
      {[
        ["hours watched", hours.toLocaleString("en-US")],
        [`calls made, of ${rows.length.toLocaleString("en-US")} coin-hours`, calls.toLocaleString("en-US")],
        ["printer jams", String(missed)],
      ].map(([k, v]) => (
        <div key={k}>
          <dt className="label">{k}</dt>
          <dd className="display mt-1 text-[30px] text-ink sm:text-[40px]">{v}</dd>
        </div>
      ))}
    </dl>
      <p className="mt-3 text-[11px] text-faded">since the first live receipt, {first.slice(0, 10)} {first.slice(11, 16)} UTC. A coin-hour is one coin, one hourly check.</p>
    </div>
  );
}
