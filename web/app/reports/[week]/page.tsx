import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyText } from "@/components/CopyText";
import { Stamp } from "@/components/Stamp";
import { TornEdge } from "@/components/TornEdge";
import { EnvLabel } from "@/components/Trust";
import { STATE_LABEL } from "@/lib/coverage";
import { EPISODE_RULE } from "@/lib/evidence";
import { signedPct } from "@/lib/format";
import { caveats, ceilPct, floorPct, linkedinCaption, parseWeekKey, REPORT_RULE, weekRange } from "@/lib/report";
import { loadReports, SITE } from "@/lib/reportData";

export const dynamic = "force-dynamic"; // computed from the live database, pinned to the week's fixed cut-off

export async function generateMetadata({ params }: { params: { week: string } }): Promise<Metadata> {
  if (!parseWeekKey(params.week)) return { title: "Report not found" };
  return { title: `Weekly report ${params.week}`, description: `HOPIUM printer report for ISO week ${params.week}: calls, hits, misses, coverage and the most confident wrong call.` };
}

const hm = (iso: string) => `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;

function Line({ k, v, strong, tone }: { k: string; v: React.ReactNode; strong?: boolean; tone?: "red" | "green" }) {
  return (
    <div className="flex justify-between gap-4 border-b border-dashed border-rule py-1.5 text-[13px]">
      <span className="text-faded">{k}</span>
      <span className={`text-right ${tone === "red" ? "text-red" : tone === "green" ? "text-green" : strong ? "text-ink" : "text-ink/90"}`}>{v}</span>
    </div>
  );
}

function Head({ children }: { children: React.ReactNode }) {
  return <h2 className="label mt-8 border-b border-rule pb-1">{children}</h2>;
}

export default async function WeeklyReportPage({ params }: { params: { week: string } }) {
  if (!parseWeekKey(params.week)) notFound();
  const { weeks, build, error, mode } = await loadReports();
  if (error) return <p role="alert" className="py-16 text-red">Database unreachable ({error}). No report numbers are cached or invented, so none are shown.</p>;
  if (!weeks.includes(params.week)) notFound();
  const r = build(params.week);
  const url = `${SITE}/reports/${r.key}`;
  const i = weeks.indexOf(r.key);
  const newer = weeks[i - 1], older = weeks[i + 1];

  return (
    <div className="py-10">
      <p className="text-[12px]"><Link href="/reports" className="ink-link">all weekly reports</Link></p>
      <article className="mx-auto mt-4 max-w-[560px]" aria-label={`Weekly report ${r.key}`}>
        <TornEdge flip />
        <div className="slip px-6 py-6">
          <div className="flex items-baseline justify-between">
            <span className="label">HOPIUM / weekly printer report</span>
            <span className="text-[12px] text-faded">{r.key}</span>
          </div>
          <div className="rule mt-2" />
          <h1 className="display mt-4 text-[40px] leading-none text-ink">Week {r.key}</h1>
          <p className="mt-2 text-[13px] text-ink">{weekRange(r)}, UTC</p>
          <p className="mt-1 text-[12px] text-faded">Snapshot as of {hm(r.cutoff)}. <EnvLabel mode={mode} /></p>
          {r.partial && <p className="mt-2 text-[12px] text-faded">Partial week: HOPIUM launched inside it, so it covers fewer hours than a full week.</p>}

          <Head>calls</Head>
          <Line k="predictions printed" v={r.rows} />
          <Line k="direction calls made" v={r.calls} strong />
          <Line k="hits" v={r.hits} tone="green" />
          <Line k="misses" v={r.misses} tone="red" />
          <Line k="flat (dead money)" v={r.flat} />
          <Line k="pending at cut-off" v={r.pending} />
          <Line k="sat out (NO CALL)" v={r.satOut} />

          <Head>hit rate</Head>
          <div className="mt-3 flex items-end justify-between gap-4">
            <div>
              <div className="label">by episode</div>
              <div className="display text-[48px] leading-none text-ink">{r.episodes.n ? floorPct(r.episodes.rate) : "n/a"}</div>
            </div>
            <div className="text-right text-[12px] text-faded">
              {r.episodes.n ? <>{r.episodes.hits} of {r.episodes.n} episodes<br />95% Wilson {floorPct(r.episodes.lo)} to {ceilPct(r.episodes.hi)}</> : "no graded episodes"}
            </div>
          </div>
          <Line k="episodes started" v={`${r.episodes.started} (from ${r.episodes.calls} ${r.episodes.calls === 1 ? "call" : "calls"})`} />
          <Line k="episode flat / pending" v={`${r.episodes.flat} / ${r.episodes.pending}`} />
          <Line k="per call (overlapping)" v={r.callRate.n ? `${floorPct(r.callRate.rate)}, ${r.hits} of ${r.callRate.n}, Wilson ${floorPct(r.callRate.lo)} to ${ceilPct(r.callRate.hi)}` : "n/a"} />

          <Head>printer</Head>
          <Line k="coverage" v={r.coverage.pct === null ? "n/a" : `${floorPct(r.coverage.pct)} (${r.coverage.published} of ${r.coverage.expected} slots)`} tone={r.coverage.pct !== null && r.coverage.pct < 0.9 ? "red" : undefined} />
          <Line k="model version" v={r.versions.join(", ") || "none"} />
          <Line k="witness stamps / failed" v={`${r.witness.submitted} / ${r.witness.failed}`} />
          <div className="mt-3 text-[12px]">
            <div className="label">outages</div>
            {!r.outages.length ? <p className="mt-1 text-ink">None. Every scheduled slot was published.</p> : (
              <ul className="mt-1 space-y-1">
                {r.outages.map((g) => (
                  <li key={g.start + g.state} className="text-faded">
                    <span className="text-ink">{hm(g.start)}{g.end !== g.start ? <> to {hm(g.end)}</> : null}</span>, {g.slots} slots, <span className="text-red">{STATE_LABEL[g.state]}</span>{g.reason !== STATE_LABEL[g.state] ? <>: {g.reason}</> : null}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-1 text-faded">Missing slots are never backfilled. Full ledger on <Link className="ink-link" href="/coverage">/coverage</Link>.</p>
          </div>

          <Head>REKT of the week</Head>
          {r.rekt ? (
            <div className="mt-3 flex items-center justify-between gap-4">
              <p className="text-[13px] leading-6">
                <Link className="ink-link" href={`/r/${r.rekt.id}`}>Receipt #{r.rekt.id}</Link>: {r.rekt.coin}{" "}
                <span className={r.rekt.signal === "UP" ? "text-green" : "text-red"}>{r.rekt.signal}</span> at {hm(r.rekt.close)}, lean{" "}
                {(r.rekt.lean * 100).toFixed(1)}%, moved {signedPct(r.rekt.move)}. The most confident call that went the wrong way.
              </p>
              <div className="shrink-0"><Stamp kind="REKT" seed={r.rekt.id} size="md" /></div>
            </div>
          ) : <p className="mt-3 text-[13px]">No graded misses this week.</p>}

          <Head>read this before sharing</Head>
          <ul className="mt-2 list-none space-y-2 text-[12px] leading-5 text-faded">
            {caveats(r).map((c) => <li key={c}>{c}</li>)}
          </ul>
          <p className="mt-3 text-[11px] leading-5 text-faded">{REPORT_RULE} {EPISODE_RULE}</p>

          <Head>LinkedIn caption</Head>
          <div className="mt-3"><CopyText text={linkedinCaption(r, url)} label="LinkedIn caption" /></div>
          <p className="mt-2 text-[11px] text-faded">
            Committed to git as{" "}
            <a className="ink-link" href={`https://github.com/KASHITOp/HOPIUM/blob/main/reports/${r.key}.md`}>reports/{r.key}.md</a>{" "}
            by the weekly job. Share image: <a className="ink-link" href={`/reports/${r.key}/opengraph-image`}>1200 x 627</a>.
          </p>
          <div className="rule mt-6" />
          <p className="mt-3 text-center text-[11px] tracking-[0.2em] text-faded">THANK YOU FOR NOT TRADING ON THIS</p>
        </div>
        <TornEdge />
      </article>
      <nav aria-label="Other weeks" className="mx-auto mt-6 flex max-w-[560px] justify-between text-[12px]">
        {older ? <Link className="ink-link" href={`/reports/${older}`}>week {older}</Link> : <span />}
        {newer ? <Link className="ink-link" href={`/reports/${newer}`}>week {newer}</Link> : <span />}
      </nav>
    </div>
  );
}
