/** Ink-on-ledger charts: rule-coloured grid, faded-ink axis labels, ink data lines, hatched fills. */
const F = '"IBM Plex Mono", monospace';

export function LineChart({ points, yMin = 0, yMax = 1, refY, refLabel, yFmt = (v: number) => `${Math.round(v * 100)}%`, height = 220, label }: {
  points: { t: number; v: number }[]; yMin?: number; yMax?: number; refY?: number; refLabel?: string; yFmt?: (v: number) => string; height?: number; label: string;
}) {
  const W = 640, H = height, L = 48, R = 12, T = 12, B = 28;
  if (points.length < 2) return <p className="text-[13px] text-faded">Not enough graded calls to draw this yet (n = {points.length}).</p>;
  const t0 = points[0]!.t, t1 = points[points.length - 1]!.t;
  const x = (t: number) => L + ((t - t0) / (t1 - t0 || 1)) * (W - L - R);
  const y = (v: number) => T + (1 - (v - yMin) / (yMax - yMin)) * (H - T - B);
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join("");
  const ticks = [yMin, (yMin + yMax) / 2, yMax];
  const date = (t: number) => new Date(t).toISOString().slice(5, 10);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={label}>
      <defs>
        <pattern id="lc-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="#3A362E" strokeWidth="2" />
        </pattern>
      </defs>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#3A362E" />
          <text x={L - 6} y={y(v) + 3} textAnchor="end" fontSize="10" fill="#8F897C" fontFamily={F}>{yFmt(v)}</text>
        </g>
      ))}
      <path d={`${d}L${x(t1)},${y(yMin)}L${x(t0)},${y(yMin)}Z`} fill="url(#lc-hatch)" />
      {refY !== undefined && (
        <g>
          <line x1={L} x2={W - R} y1={y(refY)} y2={y(refY)} stroke="#8F897C" strokeDasharray="5 4" />
          {refLabel && <text x={W - R} y={y(refY) - 5} textAnchor="end" fontSize="10" fill="#8F897C" fontFamily={F}>{refLabel}</text>}
        </g>
      )}
      <path d={d} fill="none" stroke="#D6CEBD" strokeWidth="1.8" />
      <text x={L} y={H - 8} fontSize="10" fill="#8F897C" fontFamily={F}>{date(t0)}</text>
      <text x={W - R} y={H - 8} textAnchor="end" fontSize="10" fill="#8F897C" fontFamily={F}>{date(t1)}</text>
    </svg>
  );
}

export function CalibrationChart({ bins, label }: { bins: { predicted: number; actual: number; n: number; kind: "up" | "down" }[]; label: string }) {
  const S = 300, P = 40, M = 0.6; // axes 0..60%: the model rarely says more
  const s = (v: number) => P + (Math.min(M, v) / M) * (S - P - 10);
  const ys = (v: number) => S - P + 10 - (Math.min(M, v) / M) * (S - P - 10);
  return (
    <svg viewBox={`0 0 ${S} ${S}`} className="h-auto w-full max-w-[340px]" role="img" aria-label={label}>
      {[0, 0.2, 0.4, 0.6].map((t) => (
        <g key={t} fontFamily={F} fontSize="9" fill="#8F897C">
          <line x1={s(t)} x2={s(t)} y1={ys(0)} y2={ys(M)} stroke="#3A362E" />
          <line x1={s(0)} x2={s(M)} y1={ys(t)} y2={ys(t)} stroke="#3A362E" />
          <text x={s(t)} y={ys(0) + 14} textAnchor="middle">{t * 100}%</text>
          <text x={s(0) - 6} y={ys(t) + 3} textAnchor="end">{t * 100}%</text>
        </g>
      ))}
      <line x1={s(0)} y1={ys(0)} x2={s(M)} y2={ys(M)} stroke="#8F897C" strokeDasharray="4 4" />
      <text x={s(0.42)} y={ys(0.47)} fontSize="9" fill="#8F897C" fontFamily={F} transform={`rotate(-45 ${s(0.42)} ${ys(0.47)})`}>perfect</text>
      {bins.map((b, i) =>
        b.kind === "up" ? (
          <circle key={i} cx={s(b.predicted)} cy={ys(b.actual)} r={Math.min(9, 3 + Math.sqrt(b.n) / 4)} fill="none" stroke="#D6CEBD" strokeWidth="1.6" />
        ) : (
          <rect key={i} x={s(b.predicted) - 4} y={ys(b.actual) - 4} width="8" height="8" fill="none" stroke="#8F897C" strokeWidth="1.6" />
        ),
      )}
      <text x={S / 2} y={S - 6} textAnchor="middle" fontSize="9" fill="#8F897C" fontFamily={F}>model said</text>
      <text x={10} y={S / 2} textAnchor="middle" fontSize="9" fill="#8F897C" fontFamily={F} transform={`rotate(-90 10 ${S / 2})`}>actually happened</text>
    </svg>
  );
}
