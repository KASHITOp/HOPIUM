import type { Metadata } from "next";
import { LocalTime } from "@/components/LocalTime";
import { EnvLabel } from "@/components/Trust";
import { getPredictions, getRegistry, MODE } from "@/lib/data";
import { perVersion } from "@/lib/registry";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Models", description: "Every HOPIUM model version and rule set, with its own live record." };

const KIND = { initial: "initial release", retrain_same_procedure: "automatic retrain, unchanged procedure", procedure_change: "procedure change (features, model, thresholds or research)" } as const;

export default async function ModelsPage() {
  const [{ data: preds }, reg] = await Promise.all([getPredictions(20000), getRegistry()]);
  const stats = perVersion(preds, reg.data);
  return (
    <div className="py-10 text-[14px] leading-7">
      <h1 className="display text-[48px] text-ink">Model registry</h1>
      <EnvLabel mode={MODE} />
      <p className="mt-3 max-w-[70ch]">
        Every version that has ever published, with the exact artifact, code and rules. Entries are append-only; a new version
        never resets or hides an old one. Records below are per version; nothing is pooled across versions.
        {reg.error ? " Source: committed registry file (database registry not reachable)." : ""}
      </p>
      {stats.map((s) => (
        <section key={s.version} id={s.version} className="mt-8 border-t-2 border-ink pt-3">
          <h2 className="display text-[26px] text-ink">{s.version}</h2>
          {!s.entry ? <p className="text-red">Unregistered: predictions carry this version but no registry entry exists.</p> : (
            <dl className="grid gap-x-6 text-[12px] sm:grid-cols-2">
              {([
                ["change", `${KIND[s.entry.change_kind]}. ${s.entry.change_reason}`],
                ["artifact sha256", s.entry.artifact_sha256],
                ["code commit", s.entry.code_commit && <a className="ink-link" href={`https://github.com/KASHITOp/HOPIUM/commit/${s.entry.code_commit}`}>{s.entry.code_commit.slice(0, 12)}</a>],
                ["feature schema", s.entry.feature_schema],
                ["training", `${s.entry.training_period}; cutoff ${s.entry.training_cutoff}`],
                ["decision rule", s.entry.decision_rule],
                ["grading rule", s.entry.grading_rule],
                ["activated (first live row, database clock)", s.entry.activated_at ? <LocalTime iso={s.entry.activated_at} /> : s.first ? <>first reference close <LocalTime iso={s.first} /></> : "never published"],
                ["retired", s.entry.retired_at ? <LocalTime iso={s.entry.retired_at} /> : "active or not retired"],
                ["research", s.entry.research_artifacts],
              ] as const).map(([k, v]) => (
                <div key={k} className="border-b border-rule py-1"><dt className="label">{k}</dt><dd className="break-all text-ink">{v ?? "unknown"}</dd></div>
              ))}
            </dl>
          )}
          <p className="mt-2 text-[12px]">
            Live record for this version only: {s.rows} receipts, {s.calls} calls, {s.graded} graded ({s.hits} hit, {s.misses} miss, {s.flats} flat).
            {s.calls < 30 ? " Too few calls to judge anything." : ""}
          </p>
        </section>
      ))}
    </div>
  );
}
