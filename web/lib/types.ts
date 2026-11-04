export type Coin = "BTC" | "ETH" | "SOL";
export type Signal = "UP" | "DOWN" | "NO_CALL";
export type Outcome = "HIT" | "MISS" | "FLAT" | "SAT_OUT";

/** One row of public.predictions, exactly as the database stores it. */
export interface Prediction {
  id: number;
  coin: Coin;
  horizon: string; // "12h" for the live v3 engine
  prob_up: number; // v3: P(BIG_UP)
  signal: Signal;
  price_at_call: number;
  candle_close_time: string; // ISO UTC
  inserted_at: string; // ISO UTC, stamped by the database
  target_time: string;
  model_version: string;
  p_big_up: number | null;
  p_big_down: number | null;
  score: number | null;
  threshold: number | null;
  k: number | null;
  price_at_target: number | null;
  move: number | null;
  outcome: Outcome | null;
  hit: boolean | null;
  graded_at: string | null;
}

export interface RunLog {
  id: number;
  job: "predict" | "grade" | "retrain";
  candle_close_time: string | null;
  status: "ok" | "missed" | "error";
  detail: string | null;
  logged_at: string;
}

export interface Candle {
  coin: Coin;
  open_time: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface ModelRun {
  model_version: string;
  trained_at: string;
  details: Record<string, unknown> | null;
}
