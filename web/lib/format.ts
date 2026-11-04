export function istString(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }) + " IST";
}

export function utcString(iso: string): string {
  const d = new Date(iso);
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)} UTC`;
}

export function price(v: number): string {
  return v >= 1000 ? v.toLocaleString("en-US", { maximumFractionDigits: 0 }) : v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function signedPct(x: number | null | undefined, digits = 2): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return "n/a";
  const s = (x * 100).toFixed(digits);
  return `${x > 0 ? "+" : x < 0 ? "" : ""}${s}%`.replace("-", "−");
}

export function minutesBetween(a: string, b: string): number {
  return (Date.parse(b) - Date.parse(a)) / 60e3;
}
