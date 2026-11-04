"use client";
import { useEffect, useState } from "react";

function fmt(ms: number) {
  if (ms <= 0) return "grading now";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${h}h ${String(m).padStart(2, "0")}m ${String(sec).padStart(2, "0")}s`;
}

export function Countdown({ to }: { to: string }) {
  const target = Date.parse(to);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return <span className="tabular-nums" aria-live="off">{now === null ? "..." : fmt(target - now)}</span>;
}
