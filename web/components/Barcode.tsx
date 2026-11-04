/** Real Code 39 barcode of the receipt id (scannable). Bars in faded ink. */
const CODE39: Record<string, string> = {
  "0": "nnnwwnwnn", "1": "wnnwnnnnw", "2": "nnwwnnnnw", "3": "wnwwnnnnn", "4": "nnnwwnnnw",
  "5": "wnnwwnnnn", "6": "nnwwwnnnn", "7": "nnnwnnwnw", "8": "wnnwnnwnn", "9": "nnwwnnwnn", "*": "nwnnwnwnn",
};

export function code39Bars(text: string): { x: number; w: number }[] {
  const N = 1, W = 2.5;
  const bars: { x: number; w: number }[] = [];
  let x = 0;
  for (const ch of `*${text}*`) {
    const pat = CODE39[ch];
    if (!pat) continue;
    [...pat].forEach((p, i) => {
      const w = p === "w" ? W : N;
      if (i % 2 === 0) bars.push({ x, w });
      x += w;
    });
    x += N; // inter-character gap
  }
  return bars.concat([{ x, w: 0 }]);
}

export function Barcode({ id, height = 34 }: { id: number; height?: number }) {
  const bars = code39Bars(String(id));
  const width = bars[bars.length - 1]!.x;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} height={height} className="w-full max-w-[140px]" role="img" aria-label={`Barcode for receipt ${id}`} preserveAspectRatio="none">
      {bars.slice(0, -1).map((b, i) => (
        <rect key={i} x={b.x} y={0} width={b.w} height={height} fill="#8F897C" />
      ))}
    </svg>
  );
}
