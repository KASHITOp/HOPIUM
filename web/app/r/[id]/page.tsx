import type { Metadata } from "next";
import type { Prediction } from "@/lib/types";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Countdown } from "@/components/Countdown";
import { LocalTime } from "@/components/LocalTime";
import { Receipt } from "@/components/Receipt";
import { getChain, getPrediction } from "@/lib/data";
import { canonical, sha256, verifyChain, witnessFor } from "@/lib/commit";
import { signedPct } from "@/lib/format";
import { latency, orderingIssues, stages } from "@/lib/lifecycle";
import { rowOutcome, RULES } from "@/lib/outcomes";
import { PROVENANCE_LABEL, provenanceOf } from "@/lib/provenance";

export const dynamic = "force-dynamic"; // live data: never serve a build-time snapshot

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const { data: p } = await getPrediction(Number(params.id));
  if (!p) return { title: "Receipt not found" };
  const call = p.signal === "NO_CALL" ? "no call" : p.signal;
  return { title: `Receipt #${p.id}: ${p.coin} ${p.horizon} ${call}`, description: `HOPIUM receipt #${p.id}, printed before the outcome existed.` };
}

export default async function ReceiptPage({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const [{ data: p, error }, chainRes] = await Promise.all([getPrediction(id), getChain()]);
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
        <h2 className="display mt-8 text-[26px] text-ink">Tamper evidence</h2>
        <TamperEvidence p={p} chain={chainRes.data} chainError={chainRes.error} />
        <p className="mt-6"><Link className="ink-link" href="/receipts">All receipts</Link></p>
      </div>
    </div>
  );
}

function TamperEvidence({ p, chain, chainError }: { p: Prediction; chain: Awaited<ReturnType<typeof getChain>>["data"]; chainError: string | null }) {
  if (chainError) return <p className="text-[12px] text-red">Hash chain not configured or unreachable ({chainError}). This receipt has no commitment to check.</p>;
  const c = chain.commitments.find((x) => x.prediction_id === p.id);
  if (!c) return <p className="text-[12px] text-red">Not yet committed to the hash chain (it is added within the hour after storage).</p>;
  const recomputed = sha256(canonical(p as unknown as Record<string, unknown>));
  const prefix = chain.commitments.filter((x) => x.seq <= c.seq);
  const errs = verifyChain(prefix);
  const w = witnessFor(c.seq, chain.witness);
  const lagH = (Date.parse(c.committed_at) - Date.parse(p.inserted_at)) / 3600e3;
  return (
    <div className="text-[12px] leading-6">
      <p>Chain position #{c.seq}, committed <LocalTime iso={c.committed_at} /> (database clock{lagH > 2 ? `, ${lagH.toFixed(0)} h after storage: this row predates the chain, so the chain only vouches for it from that moment` : ""}).</p>
      <p className="break-all">payload sha256 <span className="text-ink">{c.payload_hash}</span></p>
      <p>Recomputed on this page from the live row: <strong className={recomputed === c.payload_hash ? "text-ink" : "text-red"}>{recomputed === c.payload_hash ? "matches" : "DOES NOT MATCH"}</strong>.
        Chain #1 to #{c.seq}: <strong className={errs.length ? "text-red" : "text-ink"}>{errs.length ? errs.join("; ") : "every link recomputes"}</strong>.</p>
      <p>Independent witness: {w ? <>covered by OpenTimestamps stamp of chain #{w.chain_seq}, submitted <LocalTime iso={w.logged_at} /> (<a className="ink-link" href={`https://github.com/KASHITOp/HOPIUM/blob/main/${w.receipt_path}`}>proof file</a>). Proves existence no later than that stamp&apos;s Bitcoin block, not the earlier storage time.</> : <span className="text-red">not witnessed yet.</span>}</p>
      <p className="text-faded">This page runs on the operator&apos;s server. To check without trusting it, run the standalone verifier (see How it works).</p>
    </div>
  );
}
