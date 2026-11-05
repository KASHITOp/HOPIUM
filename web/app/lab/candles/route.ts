import { getCandles } from "@/lib/data";

export const dynamic = "force-dynamic"; // live data: never serve a build-time snapshot

export async function GET(req: Request) {
  const coin = new URL(req.url).searchParams.get("coin") ?? "BTC";
  const { data, error, mode } = await getCandles(90);
  const bars = data.filter((c) => c.coin === coin).map((c) => ({ t: Date.parse(c.open_time), o: c.o, h: c.h, l: c.l, c: c.c, v: c.v }));
  return Response.json({ coin, mode, error, bars });
}
