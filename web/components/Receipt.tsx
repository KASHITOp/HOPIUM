import Link from "next/link";
import { price, signedPct } from "@/lib/format";
import { netReturn } from "@/lib/grading";
import { DISCLAIMER, lean } from "@/lib/summary";
import type { Prediction } from "@/lib/types";
import { Barcode } from "./Barcode";
import { TornOutline } from "./Ink";
import { LocalTime } from "./LocalTime";
import { Stamp, stampFor } from "./Stamp";

const CALL_WORD = { UP: "UP", DOWN: "DOWN", NO_CALL: "NO CALL" } as const;

function Line({ k, v, strong }: { k: string; v: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3 text-[12px] leading-6">
      <span className="text-faded">{k}</span>
      <span className={strong ? "text-ink" : "text-ink/90"}>{v}</span>
    </div>
  );
}

/** A thermal-paper receipt, night-shift edition. Torn edges are an SVG clip-path; no shadows anywhere. */
export function Receipt({ p, printing = false, compact = false }: { p: Prediction; printing?: boolean; compact?: boolean }) {
  const graded = p.outcome !== null;
  const net = graded && p.move !== null ? netReturn(p.signal, p.move) : null;
  const gapMin = (Date.parse(p.inserted_at) - Date.parse(p.candle_close_time)) / 60e3;
  return (
    <article className={`relative ${printing ? "printing" : ""}`} aria-label={`Receipt ${p.id}: ${p.coin} ${p.horizon} ${CALL_WORD[p.signal]}`}>
      <div className="slip relative px-5 pb-7 pt-7" style={{ clipPath: "url(#torn)" }}>
        <div className="flex items-baseline justify-between">
          <span className="label">HOPIUM / receipt</span>
          <Link href={`/r/${p.id}`} className="ink-link text-[12px]">#{p.id}</Link>
        </div>
        <div className="rule mt-2" />
        <div className="mt-3 flex items-end justify-between gap-2">
          <div>
            <div className="display text-[34px] text-ink">{p.coin}</div>
            <div className="label mt-1">next {p.horizon}</div>
          </div>
          <div className={`display text-right text-[30px] ${p.signal === "UP" ? "text-green" : p.signal === "DOWN" ? "text-red" : "text-faded"}`}>
            {CALL_WORD[p.signal]}
          </div>
        </div>
        <div className="rule mt-3 border-dashed" />
        <div className="mt-2">
          <Line k="called" v={<LocalTime iso={p.candle_close_time} />} />
          {!compact && <Line k="printed" v={`${gapMin.toFixed(1)} min after candle close`} />}
          <Line k="entry (1h close)" v={`$${price(p.price_at_call)}`} strong />
          <Line k="P(big up)" v={pct(p.p_big_up ?? p.prob_up)} />
          <Line k="P(big down)" v={pct(p.p_big_down)} />
          <Line k="lean" v={`${(lean(p) * 100).toFixed(1)}% ${p.score !== null && p.score < 0 ? "down" : "up"}`} />
          <Line k="grades at" v={<LocalTime iso={p.target_time} />} />
          {graded && (
            <>
              <Line k="exit (1h close)" v={`$${price(p.price_at_target!)}`} strong />
              <Line k="move" v={signedPct(p.move)} strong />
              {p.signal !== "NO_CALL" && <Line k="after 0.2% fees" v={signedPct(net)} />}
            </>
          )}
        </div>
        <div className="mt-4">
          <Barcode id={p.id} height={compact ? 24 : 32} />
        </div>
        <div className="pointer-events-none absolute bottom-6 right-3">
          <Stamp kind={stampFor(p.outcome)} seed={p.id} size={compact ? "md" : "lg"} animate={graded && printing} />
        </div>
        {!compact && <p className="mt-3 text-[10px] leading-4 text-faded">{DISCLAIMER}</p>}
      </div>
      <TornOutline />
    </article>
  );
}

function pct(x: number | null) {
  return x === null ? "n/a" : `${(x * 100).toFixed(1)}%`;
}

export function ReceiptSkeleton({ lines = 7 }: { lines?: number }) {
  return (
    <div className="relative" role="status" aria-busy="true" aria-label="Printing receipt">
      <div className="slip px-5 pb-7 pt-7" style={{ clipPath: "url(#torn)" }}>
        <div className="skeleton-line w-1/3" />
        <div className="rule mt-3" />
        {Array.from({ length: lines }, (_, i) => (
          <div key={i} className="skeleton-line mt-3" style={{ width: `${55 + ((i * 37) % 40)}%`, animationDelay: `${i * 120}ms` }} />
        ))}
        <div className="mt-5 h-8 w-40 bg-rule/60" />
      </div>
      <TornOutline />
    </div>
  );
}
