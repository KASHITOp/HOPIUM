/**
 * Shared SVG definitions, rendered once in the layout:
 *  - #torn: zig-zag clip-path for receipt slips (objectBoundingBox, so it fits any receipt)
 *  - #uneven-ink: turbulence mask that eats holes into stamp ink so it reads as physically pressed
 */
const TEETH = 28;
const DEPTH = 0.018; // fraction of the slip's height

export function tornPoints(): string {
  const pts: string[] = [];
  for (let i = 0; i <= TEETH; i++) pts.push(`${(i / TEETH).toFixed(4)},${i % 2 ? DEPTH : 0}`);
  for (let i = TEETH; i >= 0; i--) pts.push(`${(i / TEETH).toFixed(4)},${i % 2 ? 1 - DEPTH : 1}`);
  return pts.join(" ");
}

export function InkDefs() {
  return (
    <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: "absolute" }}>
      <defs>
        <clipPath id="torn" clipPathUnits="objectBoundingBox">
          <polygon points={tornPoints()} />
        </clipPath>
        <filter id="uneven-ink" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="3" result="noise" />
          <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.2 1.85" result="holes" />
          <feComposite in="SourceGraphic" in2="holes" operator="in" result="inked" />
          <feTurbulence type="turbulence" baseFrequency="0.04" numOctaves="1" seed="9" result="warp" />
          <feDisplacementMap in="inked" in2="warp" scale="1.6" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
    </svg>
  );
}

/** 1px torn outline drawn over a slip; same points as the clip-path, stroke not scaled. */
export function TornOutline() {
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
      <polygon points={tornPoints()} fill="none" stroke="#3A362E" strokeWidth="1" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
