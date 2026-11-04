"use client";
import { useEffect, useState } from "react";
import { istString, utcString } from "@/lib/format";

/** Stored in UTC; shown in the viewer's local time, with IST and UTC on hover / focus. Server render shows UTC. */
export function LocalTime({ iso, withDate = true }: { iso: string; withDate?: boolean }) {
  const [text, setText] = useState(utcString(iso));
  useEffect(() => {
    const d = new Date(iso);
    setText(
      d.toLocaleString(undefined, withDate ? { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" } : { hour: "2-digit", minute: "2-digit" }),
    );
  }, [iso, withDate]);
  return (
    <time dateTime={iso} title={`${istString(iso)} | ${utcString(iso)}`} tabIndex={0} className="cursor-help underline decoration-rule decoration-dotted underline-offset-4">
      {text}
    </time>
  );
}
