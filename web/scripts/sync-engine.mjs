// Copies the public subset of ml/models/engine_v3.json into web/lib/engine.json (committed, so Vercel builds
// from /web alone). Run after every retrain: node scripts/sync-engine.mjs
import fs from "node:fs";
const src = JSON.parse(fs.readFileSync(new URL("../../ml/models/engine_v3.json", import.meta.url)));
const wf = src.walk_forward, ho = src.holdout;
const pick = (o, ks) => Object.fromEntries(ks.map((k) => [k, o[k] ?? null]));
const out = {
  version: src.version, label_code: src.label_code, label: src.label, threshold: src.threshold,
  threshold_source: src.threshold_source, trained_through: src.trained_through, built_at: src.built_at,
  config: pick(src.config, ["h", "k", "model", "groups", "sides"]),
  walk_forward: pick(wf, ["dev_period", "trades", "net_0.20%", "net_0.15%", "net_0.10%", "mean_net_trade", "mean_gross_trade",
    "win_rate", "avg_win", "avg_loss", "sharpe", "sharpe_ci95", "max_dd", "per_coin", "per_year", "months_positive",
    "big_move_direction_acc", "big_move_n"]),
  folds: src.walk_forward_folds.map((f) => pick(f, ["month", "t", "trades", "net_sum"])),
  holdout: pick(ho, ["holdout", "rows", "trades", "threshold", "net_0.20%", "net_0.15%", "net_0.10%"]),
  configs_tried: fs.readFileSync(new URL("../../ml/research/results.jsonl", import.meta.url), "utf8").trim().split("\n")
    .map((l) => JSON.parse(l)).filter((r) => r.config.note !== "weekly retrain check")
    .reduce((s, r) => s.add(r.key), new Set()).size,
  old_model: { horizon: "1h", accuracy: 0.5281, n: 45259, edge_per_trade_before_fees: 0.00013, sim_return_after_fees: -0.926, trades: 4136 },
};
fs.writeFileSync(new URL("../lib/engine.json", import.meta.url), JSON.stringify(out, null, 1));
console.log("lib/engine.json", out.version, out.label_code, "configs tried:", out.configs_tried);
