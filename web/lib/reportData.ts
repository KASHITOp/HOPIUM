/** Loads everything a weekly report needs from the live database (or demo data in mock mode). */
import { getPredictions, getRunLog, getWitness } from "./data";
import { launch } from "./coverage";
import { buildWeeklyReport, reportableWeeks, type WeeklyReport } from "./report";

export async function loadReports(now = Date.now()) {
  const [p, runs, w] = await Promise.all([getPredictions(100000), getRunLog(3650), getWitness()]);
  const weeks = reportableWeeks(launch(p.data), now);
  const build = (key: string): WeeklyReport => buildWeeklyReport(p.data, runs.data, w.data, key);
  return { weeks, build, error: p.error ?? runs.error, mode: p.mode };
}

export const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://hopium-phi.vercel.app").replace(/\/$/, "");
