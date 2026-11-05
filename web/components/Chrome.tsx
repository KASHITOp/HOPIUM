import Link from "next/link";
import engine from "@/lib/engine.json";
import { DISCLAIMER } from "@/lib/summary";
import { ReceiptIcon } from "./Icons";
import { Stamp } from "./Stamp";

const NAV = [
  ["/", "Counter"],
  ["/receipts", "Receipts"],
  ["/portfolio", "Paper portfolio"],
  ["/lab", "Lab"],
  ["/how-it-works", "How it works"],
  ["/case-study", "Case study"],
  ["/maker", "Maker"],
] as const;

export function Masthead() {
  return (
    <header className="mx-auto max-w-6xl px-4 pt-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Link href="/" className="display text-[56px] leading-none text-ink no-underline sm:text-[76px]" aria-label="HOPIUM home">
          HOPIUM
        </Link>
        <div className="pb-2 text-right text-[11px] leading-5 text-faded">
          <div>An AI that admits when it&apos;s wrong.</div>
          <div>
            model <span className="text-ink">{engine.version}</span>
          </div>
        </div>
      </div>
      <div className="rule-thick mt-3" />
      <nav aria-label="Main" className="flex flex-wrap gap-x-5 gap-y-1 border-b border-rule py-2 text-[12px] uppercase tracking-[0.12em]">
        {NAV.map(([href, label]) => (
          <Link key={href} href={href} className="text-ink no-underline hover:underline">
            {label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

export function ModelLabel({ className = "" }: { className?: string }) {
  return (
    <p className={`border border-rule px-3 py-2 text-[12px] leading-5 ${className}`}>
      <span className="label mr-2">model label</span>
      <span className="text-ink">{engine.label}</span> <span className="text-faded">({engine.version})</span>
    </p>
  );
}

export function Footer() {
  return (
    <footer className="mx-auto mt-20 max-w-6xl px-4 pb-10">
      <div className="rule-thick" />
      <div className="grid gap-6 py-6 text-[12px] leading-5 sm:grid-cols-[2fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-2 text-ink">
            <ReceiptIcon size={18} /> <span className="display text-[20px]">HOPIUM</span>
          </div>
          <p className="mt-2 max-w-md text-ink">{DISCLAIMER}</p>
          <p className="mt-2 max-w-md text-faded">
            No trade execution, no paid tips, no sign-up, no exchange links. Every call is stored before its outcome exists;
            database triggers reject edits and deletes, though the database owner could still change rows.
          </p>
        </div>
        <ul className="space-y-1">
          <li><Link className="ink-link" href="/terms">Terms of Service</Link></li>
          <li><Link className="ink-link" href="/privacy">Privacy Policy</Link></li>
          <li><Link className="ink-link" href="/disclaimer">Disclaimer</Link></li>
        </ul>
        <ul className="space-y-1">
          <li><Link className="ink-link" href="/how-it-works#status">System status</Link></li>
          <li><a className="ink-link" href="https://github.com/KASHITOp/HOPIUM">Source code</a></li>
          <li><Link className="ink-link" href="/maker">Printed by Kartavyaa Patel</Link></li>
        </ul>
      </div>
    </footer>
  );
}

export function DemoBanner() {
  return (
    <div className="pointer-events-none fixed right-3 top-3 z-50 sm:right-6 sm:top-6" aria-label="Demo data: these numbers are simulated">
      <Stamp kind="DEMO DATA" seed={7} size="md" />
    </div>
  );
}
