/** Fixed-height zig-zag edge for long slips (the #torn clip-path scales with height, too deep on a long receipt). */
export function TornEdge({ flip = false }: { flip?: boolean }) {
  const T = 60, pts: string[] = [];
  for (let i = 0; i <= T; i++) pts.push(`${i / T},${i % 2 ? (flip ? 0 : 1) : flip ? 1 : 0}`);
  const poly = flip ? `0,1 ${pts.join(" ")} 1,1` : `0,0 ${pts.join(" ")} 1,0`;
  return (
    <svg className="block h-[8px] w-full" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
      <polygon points={poly} className="fill-slip" />
    </svg>
  );
}
