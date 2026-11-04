import { meterCopy } from "@/lib/summary";

/**
 * Hopium Meter: a vertical printed thermometer, ink-filled to the model's lean (scale 50% to 80%; higher leans pin at the top).
 * Lean = 0.5 + |P(big up) - P(big down)| / 2. Calls start at 58% (score threshold 0.16).
 */
export function Meter({ lean, direction, historic, threshold = 0.16 }: { lean: number; direction: "up" | "down"; historic: { k: number; n: number } | null; threshold?: number }) {
  const H = 180, top = 12, bulb = 22;
  const span = H - top - bulb;
  const y = (v: number) => top + span * (1 - (Math.min(0.8, Math.max(0.5, v)) - 0.5) / 0.3);
  const callLine = 0.5 + threshold / 2;
  const ticks = [0.5, 0.52, 0.56, 0.6, 0.65, 0.7, 0.75, 0.8];
  const id = `hatch-${Math.round(lean * 1000)}`;
  return (
    <figure className="flex items-start gap-3" aria-label={`Hopium Meter: lean ${(lean * 100).toFixed(1)}% ${direction}`}>
      <svg width="86" height={H + 8} viewBox={`0 0 86 ${H + 8}`} aria-hidden="true">
        <defs>
          <pattern id={id} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="5" stroke="#D6CEBD" strokeWidth="2.2" />
          </pattern>
        </defs>
        {/* tube */}
        <path d={`M16 ${top} h14 v${span} h-14 z`} fill="#13120F" stroke="#D6CEBD" strokeWidth="1.5" />
        <circle cx="23" cy={H - bulb / 2 + 2} r={bulb / 2 + 2} fill="#D6CEBD" stroke="#D6CEBD" strokeWidth="1.5" />
        {/* fill */}
        <rect x="18" y={y(lean)} width="10" height={top + span - y(lean)} fill={`url(#${id})`} />
        {/* call threshold */}
        <line x1="10" x2="36" y1={y(callLine)} y2={y(callLine)} stroke="#D4614C" strokeWidth="1" strokeDasharray="3 2" />
        {ticks.map((t) => (
          <g key={t}>
            <line x1="30" x2={Math.round(t * 100) % 10 === 0 ? 38 : 35} y1={y(t)} y2={y(t)} stroke="#8F897C" strokeWidth="1" />
            <text x="41" y={y(t) + 3.5} fontSize="9" fill="#8F897C" fontFamily="var(--font-mono), monospace">{Math.round(t * 100)}</text>
          </g>
        ))}
        <text x="58" y={y(callLine) + 3.5} fontSize="8" fill="#D4614C" fontFamily="var(--font-mono), monospace">call</text>
      </svg>
      <figcaption className="max-w-[220px] pt-1">
        <div className="label">Hopium Meter</div>
        <div className="display mt-1 text-[40px] text-ink">{(lean * 100).toFixed(1)}%</div>
        <div className="text-[11px] text-faded">lean {direction}. not a probability.</div>
        <p className="mt-2 text-[13px] leading-5 text-ink">{meterCopy(lean, historic)}</p>
      </figcaption>
    </figure>
  );
}
