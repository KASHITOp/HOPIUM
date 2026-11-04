import type { Outcome } from "@/lib/types";

export type StampKind = "CALLED IT" | "REKT" | "SAT OUT" | "DEAD MONEY" | "PENDING" | "DEMO DATA";

const INK: Record<StampKind, string> = {
  "CALLED IT": "#6FA27E",
  REKT: "#D4614C",
  "SAT OUT": "#6E695F",
  "DEAD MONEY": "#6E695F",
  PENDING: "#898377",
  "DEMO DATA": "#D4614C",
};

export function stampFor(outcome: Outcome | null): StampKind {
  if (outcome === "HIT") return "CALLED IT";
  if (outcome === "MISS") return "REKT";
  if (outcome === "FLAT") return "DEAD MONEY";
  if (outcome === "SAT_OUT") return "SAT OUT";
  return "PENDING";
}

/** Deterministic "random" tilt from the receipt id, so server and client agree. */
export function tilt(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return Math.round(((x - Math.floor(x)) * 16 - 8) * 10) / 10;
}

export function Stamp({ kind, seed = 1, size = "md", animate = false }: { kind: StampKind; seed?: number; size?: "sm" | "md" | "lg"; animate?: boolean }) {
  const color = INK[kind];
  const pencil = kind === "PENDING";
  const fs = size === "lg" ? 34 : size === "sm" ? 15 : 22;
  const w = Math.round(kind.length * fs * 0.68 + fs * 1.2);
  const h = Math.round(fs * 1.9);
  const rot = tilt(seed);
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width={w}
      height={h}
      role="img"
      aria-label={`Stamp: ${kind}`}
      className={animate ? "stamp-in" : undefined}
      style={{ transform: `rotate(${rot}deg)`, opacity: 0.85, ["--rot" as string]: `${rot}deg` }}
    >
      <g filter={pencil ? undefined : "url(#uneven-ink)"}>
        {!pencil && <rect x="2.5" y="2.5" width={w - 5} height={h - 5} fill="none" stroke={color} strokeWidth="3" />}
        {!pencil && <rect x="7" y="7" width={w - 14} height={h - 14} fill="none" stroke={color} strokeWidth="1" />}
        <text
          x={w / 2}
          y={h / 2 + fs * 0.35}
          textAnchor="middle"
          fill={color}
          fontFamily={pencil ? '"IBM Plex Mono", monospace' : '"Bricolage Grotesque", sans-serif'}
          fontWeight={pencil ? 500 : 800}
          fontSize={fs}
          letterSpacing={pencil ? fs * 0.25 : 1}
        >
          {kind}
        </text>
        {pencil && <path d={`M8 ${h - 6} q ${w / 4} -3 ${w / 2} 0 t ${w / 2 - 16} -1`} stroke={color} strokeWidth="1.2" fill="none" strokeLinecap="round" />}
      </g>
    </svg>
  );
}
