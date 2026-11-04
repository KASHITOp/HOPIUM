"use client";
import { useEffect, useRef, useState } from "react";

type Px = { price: number; open24: number | null };
const COINS = ["BTC", "ETH", "SOL"] as const;

/**
 * Display-only live prices. Binance public stream (data-stream.binance.vision, the market-data mirror),
 * falling back to Coinbase's public feed, with exponential-backoff reconnect.
 * Never used for grading: grading uses Binance 1h candle closes in the database.
 */
export function PriceStrip() {
  const [px, setPx] = useState<Partial<Record<(typeof COINS)[number], Px>>>({});
  const [source, setSource] = useState<"binance" | "coinbase" | "connecting" | "offline">("connecting");
  const attempt = useRef(0);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let closed = false;
    let useCoinbase = false;

    const connect = () => {
      if (closed) return;
      if (useCoinbase) {
        ws = new WebSocket("wss://ws-feed.exchange.coinbase.com");
        ws.onopen = () => {
          attempt.current = 0;
          setSource("coinbase");
          ws?.send(JSON.stringify({ type: "subscribe", product_ids: COINS.map((c) => `${c}-USD`), channels: ["ticker"] }));
        };
        ws.onmessage = (e) => {
          const m = JSON.parse(e.data as string);
          if (m.type !== "ticker") return;
          const coin = String(m.product_id).split("-")[0] as (typeof COINS)[number];
          setPx((p) => ({ ...p, [coin]: { price: Number(m.price), open24: Number(m.open_24h) || null } }));
        };
      } else {
        const streams = COINS.map((c) => `${c.toLowerCase()}usdt@miniTicker`).join("/");
        ws = new WebSocket(`wss://data-stream.binance.vision/stream?streams=${streams}`);
        ws.onopen = () => {
          attempt.current = 0;
          setSource("binance");
        };
        ws.onmessage = (e) => {
          const d = JSON.parse(e.data as string).data;
          if (!d?.s) return;
          const coin = String(d.s).replace("USDT", "") as (typeof COINS)[number];
          setPx((p) => ({ ...p, [coin]: { price: Number(d.c), open24: Number(d.o) || null } }));
        };
      }
      ws.onclose = () => {
        if (closed) return;
        attempt.current += 1;
        if (attempt.current >= 2) useCoinbase = !useCoinbase; // alternate sources after repeated failures
        setSource(attempt.current > 6 ? "offline" : "connecting");
        timer = setTimeout(connect, Math.min(30000, 1000 * 2 ** Math.min(attempt.current, 5)));
      };
      ws.onerror = () => ws?.close();
    };
    connect();
    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      ws?.close();
    };
  }, []);

  return (
    <div className="border-y border-rule">
      <div className="mx-auto flex h-[58px] max-w-6xl flex-wrap content-center items-center gap-x-6 gap-y-1 overflow-hidden px-4 text-[12px] sm:h-[36px] sm:flex-nowrap" aria-live="off">
        {COINS.map((c) => {
          const p = px[c];
          const ch = p?.open24 ? p.price / p.open24 - 1 : null;
          return (
            <span key={c} className="flex w-[104px] items-baseline gap-2 whitespace-nowrap sm:w-[190px]">
              <span className="text-faded">{c}</span>
              <span className="text-ink">{p ? p.price.toLocaleString("en-US", { maximumFractionDigits: p.price > 1000 ? 0 : 2 }) : "......"}</span>
              {ch !== null && <span className={`hidden sm:inline ${ch >= 0 ? "text-green" : "text-red"}`}>{ch >= 0 ? "+" : "−"}{Math.abs(ch * 100).toFixed(2)}% 24h</span>}
            </span>
          );
        })}
        <span className="label basis-full whitespace-nowrap sm:ml-auto sm:basis-auto">
          {source === "connecting" ? "connecting to tape" : source === "offline" ? "tape offline, retrying" : `live tape: ${source}, display only`}
        </span>
      </div>
    </div>
  );
}
