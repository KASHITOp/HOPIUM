/**
 * Weekly printer report generator (run by .github/workflows/weekly-report.yml with vite-node).
 *   npx vite-node scripts/weekly-report.ts [yyyy-ww]
 * Reads public tables (GET only) and writes ../reports/<yyyy-ww>.md plus ../reports/README.md (index).
 * Same pure functions as the /reports pages, pinned to the same cut-off, so the numbers match.
 * Env: SUPABASE_URL (API URL, dashboard link or bare ref) and SUPABASE_SERVICE_KEY (or SUPABASE_ANON_KEY).
 */
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildWeeklyReport, floorPct, latestReportableWeek, parseWeekKey, reportMarkdown, weekRange } from "../lib/report";
import { liveOnly } from "../lib/provenance";
import type { WitnessReceipt } from "../lib/commit";
import type { Prediction, RunLog } from "../lib/types";

function normalizeUrl(raw: string): string {
  raw = raw.trim().replace(/\/+$/, "");
  const ref = /\/project\/([a-z0-9]{15,})/.exec(raw)?.[1] ?? /^([a-z0-9]{15,})$/.exec(raw)?.[1];
  if (ref) return `https://${ref}.supabase.co`;
  return /^(https:\/\/[a-z0-9]+\.supabase\.co)/.exec(raw)?.[1] ?? raw;
}

const URL = normalizeUrl(process.env.SUPABASE_URL ?? "");
const KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || "";
const SITE = (process.env.SITE_URL || "https://hopium-phi.vercel.app").replace(/\/$/, "");

async function all<T>(q: string): Promise<T[]> {
  const out: T[] = [];
  for (let offset = 0; ; offset += 1000) {
    const res = await fetch(`${URL}/rest/v1/${q}&limit=1000&offset=${offset}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
    if (!res.ok) throw new Error(`${q.split("?")[0]}: HTTP ${res.status} ${await res.text()}`);
    const page = (await res.json()) as T[];
    out.push(...page);
    if (page.length < 1000) return out;
  }
}

async function main() {
  if (!URL || !KEY) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_KEY not set");
  const arg = process.argv.slice(2).find((a) => /^\d{4}-\d{2}$/.test(a));
  const key = arg ?? latestReportableWeek(Date.now());
  const w = parseWeekKey(key);
  if (!w) throw new Error(`bad week ${key}`);
  if (w.cutoff > Date.now()) throw new Error(`week ${key} cut-off ${new Date(w.cutoff).toISOString()} has not passed yet`);
  const [preds, runs, witness] = await Promise.all([
    all<Prediction>("predictions?select=*&order=id.asc"),
    all<RunLog>("run_log?select=*&order=id.asc"),
    all<WitnessReceipt>("witness_receipts?select=*&order=id.asc").catch(() => []),
  ]);
  const r = buildWeeklyReport(liveOnly(preds), runs, witness, key);
  const dir = path.resolve(__dirname, "../../reports");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${key}.md`), reportMarkdown(r, `${SITE}/reports/${key}`));
  const keys = readdirSync(dir).filter((f) => /^\d{4}-\d{2}\.md$/.test(f)).map((f) => f.slice(0, 7)).sort().reverse();
  writeFileSync(path.join(dir, "README.md"), [
    "# HOPIUM weekly printer reports", "",
    "Generated every Monday 03:31 UTC by `.github/workflows/weekly-report.yml` from the live database. Live versions with",
    `share images: ${SITE}/reports`, "",
    ...keys.map((k) => `- [${k}](${k}.md)`), "",
  ].join("\n"));
  console.log(JSON.stringify({ key, range: weekRange(r), calls: r.calls, hits: r.hits, misses: r.misses, flat: r.flat, pending: r.pending,
    satOut: r.satOut, episodes: `${r.episodes.hits}/${r.episodes.n}`, coverage: floorPct(r.coverage.pct), outages: r.outages.length, rekt: r.rekt?.id ?? null }));
}

main().catch((e) => { console.error(e); process.exit(1); });
