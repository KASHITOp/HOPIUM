/**
 * Read-only data layer with two adapters:
 *   live  Supabase REST with the public (publishable / anon) key. RLS makes it SELECT-only.
 *   mock  lib/mock.ts, always labelled DEMO DATA on screen.
 * NEXT_PUBLIC_DATA_MODE picks the adapter; it defaults to live when Supabase env vars exist.
 */
import { mockData } from "./mock";
import { liveOnly } from "./provenance";
import type { Candle, ModelRun, Prediction, RunLog } from "./types";
import type { Commitment, WitnessReceipt } from "./commit";
import { STATIC_REGISTRY, type ModelEntry } from "./registry";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export type Mode = "live" | "mock";
export const MODE: Mode =
  process.env.NEXT_PUBLIC_DATA_MODE === "mock" ? "mock" : process.env.NEXT_PUBLIC_DATA_MODE === "live" || (URL && KEY) ? "live" : "mock";

export interface Result<T> {
  data: T;
  error: string | null;
  mode: Mode;
}

async function rest<T>(path: string, revalidate = 60): Promise<T> {
  if (!URL || !KEY) throw new Error("Supabase is not configured (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY)");
  const res = await fetch(`${URL}/rest/v1/${path}`, { headers: { apikey: KEY }, next: { revalidate: Math.min(revalidate, 60) } });
  if (!res.ok) throw new Error(`database said ${res.status}`);
  return (await res.json()) as T;
}

async function wrap<T>(live: () => Promise<T>, mock: () => T): Promise<Result<T>> {
  if (MODE === "mock") return { data: mock(), error: null, mode: "mock" };
  try {
    return { data: await live(), error: null, mode: "live" };
  } catch (e) {
    return { data: mock(), error: e instanceof Error ? e.message : String(e), mode: "live" };
  }
}

/** Newest first. In live mode a failed request returns an EMPTY list plus the error (never mock rows). */
export async function getPredictions(limit = 5000): Promise<Result<Prediction[]>> {
  const r = await wrap(
    async () => liveOnly(await rest<Prediction[]>(`predictions?select=*&order=candle_close_time.desc,coin.asc&limit=${limit}`)),
    () => mockData().predictions.slice(0, limit),
  );
  return r.error ? { ...r, data: [] } : r;
}

export async function getPrediction(id: number): Promise<Result<Prediction | null>> {
  const r = await wrap(
    async () => liveOnly(await rest<Prediction[]>(`predictions?select=*&id=eq.${id}`))[0] ?? null,
    () => mockData().predictions.find((p) => p.id === id) ?? null,
  );
  return r.error ? { ...r, data: null } : r;
}

export async function getRunLog(days = 30): Promise<Result<RunLog[]>> {
  const since = new Date(Date.now() - days * 86400e3).toISOString();
  const r = await wrap(
    () => rest<RunLog[]>(`run_log?select=*&logged_at=gte.${since}&order=logged_at.desc&limit=2000`),
    () => mockData().runs,
  );
  return r.error ? { ...r, data: [] } : r;
}

export async function getCandles(days = 90): Promise<Result<Candle[]>> {
  const since = new Date(Date.now() - days * 86400e3).toISOString();
  const r = await wrap(
    () => rest<Candle[]>(`candles_cache?select=*&open_time=gte.${since}&order=open_time.asc&limit=10000`, 600),
    () => mockData().candles,
  );
  return r.error ? { ...r, data: [] } : r;
}

export async function getModelRuns(): Promise<Result<ModelRun[]>> {
  const r = await wrap(() => rest<ModelRun[]>(`model_runs?select=model_version,trained_at,details&order=trained_at.desc&limit=20`, 600), () => []);
  return r.error ? { ...r, data: [] } : r;
}

/** Hash chain + witness log (trust v2). Missing tables (migration not applied) -> error, shown as "not configured". */
export async function getChain(): Promise<Result<{ commitments: Commitment[]; witness: WitnessReceipt[] }>> {
  const empty = { commitments: [], witness: [] };
  const r = await wrap(async () => ({
    commitments: await rest<Commitment[]>(`commitments?select=*&order=seq.asc&limit=100000`),
    witness: await rest<WitnessReceipt[]>(`witness_receipts?select=*&order=id.asc&limit=100000`),
  }), () => empty);
  return r.error ? { ...r, data: empty } : r;
}

export async function getRegistry(): Promise<Result<ModelEntry[]>> {
  const r = await wrap(() => rest<ModelEntry[]>(`model_registry?select=*&order=registered_at.asc`, 600), () => STATIC_REGISTRY);
  // DB not migrated / empty: show the committed registry, labelled as such by the caller
  return r.error || !r.data.length ? { ...r, data: STATIC_REGISTRY } : r;
}
