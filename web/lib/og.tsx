/** Shared bits for next/og share images (dark receipt style). */
export const OG_SIZE = { width: 1200, height: 627 }; // LinkedIn recommended size

export async function plexMono(weight = 500): Promise<ArrayBuffer | null> {
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@${weight}`, { headers: { "User-Agent": "Mozilla/5.0 (X11; Linux) AppleWebKit/537.36 Safari/537.36" } })).text();
    const url = css.match(/src: url\((https:[^)]+\.ttf)\)/)?.[1];
    return url ? await (await fetch(url)).arrayBuffer() : null;
  } catch {
    return null;
  }
}

export function tornEdge(width: number, teeth = 40, depth = 12, flip = false) {
  const pts: string[] = [];
  for (let i = 0; i <= teeth; i++) pts.push(`${(i / teeth) * width},${i % 2 ? (flip ? 0 : depth) : flip ? depth : 0}`);
  return flip ? `0,${depth} ${pts.join(" ")} ${width},${depth}` : `0,0 ${pts.join(" ")} ${width},0`;
}
