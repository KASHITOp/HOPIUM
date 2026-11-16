import type { Metadata } from "next";
import Link from "next/link";
import { TornEdge } from "@/components/TornEdge";
import { EnvLabel } from "@/components/Trust";
import { floorPct, REPORT_RULE, weekRange } from "@/lib/report";
import { loadReports } from "@/lib/reportData";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Weekly reports", description: "One printer report per ISO week: calls, hits, misses, coverage, outages and the most confident wrong call." };

export default async function ReportsIndex() {
  const { weeks, build, error, mode } = await loadReports();
  return (
    <div className="py-10">
      <h1 className="display text-[48px] text-ink sm:text-[64px]">Weekly reports.</h1>
      <p className="mt-3 max-w-2xl text-[14px] leading-6">
        Every Monday at 03:31 UTC the printer reports on the week that just ended, and the same report is committed to git. Small
        samples and overlapping calls: read the caveats on each report before quoting a number. <EnvLabel mode={mode} />
      </p>
      {error && <p role="alert" className="mt-4 border border-red px-3 py-2 text-[13px] text-red">Database unreachable ({error}). No numbers shown.</p>}
      {!error && (
        <div className="mx-auto mt-8 max-w-[640px]">
          <TornEdge flip />
          <div className="slip px-6 py-5">
            <div className="label flex justify-between border-b border-rule pb-1"><span>week</span><span>calls . episodes right . coverage</span></div>
            {!weeks.length ? <p className="py-4 text-[13px]">No complete week yet. The first report prints the Monday after launch week ends.</p> : (
              <ul>
                {weeks.map((k) => {
                  const r = build(k);
                  return (
                    <li key={k} className="flex flex-wrap items-baseline justify-between gap-x-4 border-b border-dashed border-rule py-2 text-[13px]">
                      <span><Link href={`/reports/${k}`} className="ink-link">{k}</Link> <span className="text-[12px] text-faded">{weekRange(r)}{r.partial ? ", partial" : ""}</span></span>
                      <span className="text-ink">
                        {r.calls} . {r.episodes.n ? `${r.episodes.hits}/${r.episodes.n}` : "n/a"} . {floorPct(r.coverage.pct)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="mt-4 text-[11px] leading-5 text-faded">{REPORT_RULE}</p>
          </div>
          <TornEdge />
        </div>
      )}
    </div>
  );
}
