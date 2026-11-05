import { getPredictions } from "@/lib/data";
import { applyFilters, parseFilters, toCsv } from "@/lib/filters";

export const dynamic = "force-dynamic"; // live data: never serve a build-time snapshot

export async function GET(req: Request) {
  const sp = Object.fromEntries(new URL(req.url).searchParams.entries());
  const { data, mode } = await getPredictions(20000);
  const rows = applyFilters(data, parseFilters(sp));
  return new Response(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="hopium-receipts${mode === "mock" ? "-DEMO" : ""}.csv"`,
    },
  });
}
