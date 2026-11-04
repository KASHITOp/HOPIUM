import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Countdown } from "@/components/Countdown";
import { LocalTime } from "@/components/LocalTime";
import { Receipt } from "@/components/Receipt";
import { getPrediction } from "@/lib/data";
import { signedPct } from "@/lib/format";
import { latency, orderingIssues, stages } from "@/lib/lifecycle";
import { rowOutcome, RULES } from "@/lib/outcomes";
import { PROVENANCE_LABEL, provenanceOf } from "@/lib/provenance";

export const revalidate = 60;

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const { data: p } = await getPrediction(Number(params.id));
  if (!p) return { title: "Receipt not found" };
  const call = p.signal === "NO_CALL" ? "no call" : p.signal;
  return { title: `Receipt #${p.id}: ${p.coin} ${p.horizon} ${call}`, description: `HOPIUM receipt #${p.id}, printed before the outcome existed.` };
}

export default async function ReceiptPage({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const { data: p, error } = await getPrediction(id);
  if (error) return <p role="alert" className="py-16 text-red">Database unreachable ({error}). This receipt exists or not; we cannot check right now.</p>;
  if (!p) notFound();
  const gap = (Date.parse(p.inserted_at) - Date.parse(p.candle_close_time)) / 60e3;
  const o = rowOutcome(p);
  const lat = latency(p);
  const issues = orderingIssues(p);
  const SRC = { market: "market reference", application: "job-reported", database: "database clock", derived: "rule" } as const;
  return (
    <div className="grid gap-10 py-10 md:grid-cols-[380px_1fr]">
      <Receipt p={p} />
      <div className="text-[14px] leading-7">
        <h1 className="display text-[48px] text-ink">Receipt #{p.id}</h1>
        <p>
          Stored <LocalTime iso={p.inserted_at} />, {gap.toFixed(1)} minutes after the {p.coin} reference candle closed at{" "}
          <LocalTime iso={p.candle_close_time} />. The database stamps the storage time with its own clock and rejects inserts more
          than 20 minutes late. That is the operator&apos;s database, not an independent witness.
        </p>
        {p.outcome === null ? (
          <p className="mt-3">Grades in <span className="text-ink"><Countdown to={p.target_time} /></span>, against the Binance 1h close at <LocalTime iso={p.target_time} />.</p>
        ) : (
          <p className="mt-3">
            Graded <LocalTime iso={p.graded_at!} />. The price moved {signedPct(p.move)}
            {p.signal !== "NO_CALL" ? (
              <>. Three separate results: direction <strong className="text-ink">{o.direction.toLowerCase()}</strong>; the declared
              {" "}{o.declared === "BIG_UP" ? "big up" : "big down"} move (beyond {((p.k ?? 0.01) * 100).toFixed(0)}%){" "}
              <strong className="text-ink">{o.target ? "happened" : "did not happen"}</strong>; a simulated trade at the reference
              closes returned <strong className="text-ink">{signedPct(o.net)}</strong> after 0.2% fees. Reference closes are the
              grading convention, not prices anyone could have traded at.</>
            ) : <>. The model sat this one out.</>}
          </p>
        )}
        <p className="mt-3 text-faded">
          Model {p.model_version}. Score {p.score?.toFixed(4) ?? "n/a"} against a threshold of {p.threshold ?? "n/a"}. Database
          triggers reject edits, re-grading and deletes; someone with owner access to the database could still change them.
        </p>
        <h2 className="display mt-8 text-[26px] text-ink">Timeline</h2>
        <p className="label">data: {PROVENANCE_LABEL[provenanceOf(p)]}. times stored in UTC, shown in your time zone (hover for UTC)</p>
        <table className="mt-2 w-full border-collapse text-[12px]">
          <tbody>
            {stages(p).map((s) => (
              <tr key={s.key} className="border-b border-rule">
                <td className="py-1 pr-3 text-faded">{s.label}</td>
                <td className="pr-3">{s.iso ? <LocalTime iso={s.iso} /> : "unknown (not recorded)"}</td>
                <td className="text-faded">{SRC[s.source]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-[12px] text-faded">
          Generation latency: {lat.generation === null ? "not measurable" : `${lat.generation.toFixed(1)} min (job-reported)`}.
          Publication latency: {lat.publication === null ? "not measurable" : `${lat.publication.toFixed(1)} min (database clock)`}.
          {issues.length ? <span className="text-red"> Timestamp problems: {issues.join("; ")}.</span> : " Timestamps are in order."}
        </p>
        <p className="mt-2 text-[12px] text-faded">Rules: {RULES.grading}; {RULES.flat_rule}; {RULES.target_rule}; fees {RULES.fee_rule}.</p>
        <p className="mt-6"><Link className="ink-link" href="/receipts">All receipts</Link></p>
      </div>
    </div>
  );
}
