import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Countdown } from "@/components/Countdown";
import { LocalTime } from "@/components/LocalTime";
import { Receipt } from "@/components/Receipt";
import { getPrediction } from "@/lib/data";
import { signedPct } from "@/lib/format";
import { netReturn } from "@/lib/grading";

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
  return (
    <div className="grid gap-10 py-10 md:grid-cols-[380px_1fr]">
      <Receipt p={p} />
      <div className="text-[14px] leading-7">
        <h1 className="display text-[48px] text-ink">Receipt #{p.id}</h1>
        <p>
          Printed <LocalTime iso={p.inserted_at} />, {gap.toFixed(1)} minutes after the {p.coin} candle closed at{" "}
          <LocalTime iso={p.candle_close_time} />. The database stamps that time itself and rejects anything printed more than 20
          minutes late.
        </p>
        {p.outcome === null ? (
          <p className="mt-3">Grades in <span className="text-ink"><Countdown to={p.target_time} /></span>, against the Binance 1h close at <LocalTime iso={p.target_time} />.</p>
        ) : (
          <p className="mt-3">
            Graded <LocalTime iso={p.graded_at!} />. The price moved {signedPct(p.move)}
            {p.signal !== "NO_CALL" ? <>; following the call would have returned {signedPct(netReturn(p.signal, p.move!))} after 0.2% fees.</> : <>. The model sat this one out.</>}
          </p>
        )}
        <p className="mt-3 text-faded">
          Model {p.model_version}. Score {p.score?.toFixed(4) ?? "n/a"} against a threshold of {p.threshold ?? "n/a"}. Nothing on this receipt can be edited after it was printed.
        </p>
        <p className="mt-6"><Link className="ink-link" href="/receipts">All receipts</Link></p>
      </div>
    </div>
  );
}
