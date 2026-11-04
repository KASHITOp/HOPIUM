"use client";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="py-16">
      <h1 className="display text-[48px] text-ink">Paper jam.</h1>
      <p className="mt-3 max-w-lg text-ink">Something broke while printing this page. No numbers were made up to fill the gap.</p>
      <button onClick={reset} className="mt-5 border border-ink px-4 py-2 text-[13px] text-ink hover:underline">Try printing again</button>
    </div>
  );
}
