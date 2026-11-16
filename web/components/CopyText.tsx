"use client";
import { useState } from "react";

/** Read-only caption with a copy button. Works without JS (the textarea can be selected by hand). */
export function CopyText({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <div>
      <textarea readOnly value={text} aria-label={label} rows={10} className="w-full resize-y border border-rule bg-counter p-3 text-[12px] leading-5 text-ink" />
      <button
        type="button"
        className="mt-2 border border-ink px-3 py-1 text-[12px] text-ink hover:underline"
        onClick={() => navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 2000); }, () => setDone(false))}
      >
        {done ? "copied" : "copy caption"}
      </button>
    </div>
  );
}
