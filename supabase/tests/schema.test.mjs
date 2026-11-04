import { PGlite } from "@electric-sql/pglite";
import fs from "fs";
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role;`);
await db.exec(fs.readFileSync(new URL("../schema.sql", import.meta.url), "utf8"));
// Test clock: "now" for inserts is controlled through a session setting.
await db.exec(`create or replace function public.predictions_before_insert() returns trigger language plpgsql as $$
begin new.inserted_at := current_setting('test.now')::timestamptz; return new; end $$;`);
const H = 3600e3, base = Date.UTC(2026, 0, 1, 14);
const iso = (ms) => new Date(ms).toISOString();
let ok = 0, bad = 0;
async function t(name, sqls, expectOk) {
  try { for (const s of [].concat(sqls)) await db.query(s); expectOk ? ok++ : bad++; console.log(expectOk ? "PASS" : "FAIL", name); }
  catch (e) { expectOk ? bad++ : ok++; console.log(expectOk ? "FAIL" : "PASS", name, "->", e.message.split("\n")[0]); }
}
const now = (ms) => `set test.now = '${iso(ms)}'`;
const ins = ({ coin = "BTC", h = "1h", p = 0.6, sig = "UP", close = base, tgt }) =>
  `insert into predictions (coin,horizon,prob_up,signal,price_at_call,candle_close_time,target_time,model_version)
   values ('${coin}','${h}',${p},'${sig}',100,'${iso(close)}','${iso(tgt ?? close + (h === "1h" ? H : 4 * H))}','v1')`;
await t("on-time insert (+5 min) accepted", [now(base + 5 * 60e3), ins({})], true);
await t("duplicate hour rejected (idempotency)", [ins({})], false);
await t("late insert (+25 min) rejected", [now(base + 25 * 60e3), ins({ coin: "ETH" })], false);
await t("insert before candle close rejected", [now(base - 60e3), ins({ coin: "ETH" })], false);
await t("signal/prob mismatch rejected", [now(base + 60e3), ins({ coin: "ETH", p: 0.5 })], false);
await t("NO_CALL at 0.58 boundary accepted", [ins({ coin: "ETH", p: 0.58, sig: "NO_CALL" })], true);
await t("wrong target_time rejected", [ins({ coin: "SOL", tgt: base + 2 * H })], false);
await t("prob_up edit rejected", [`update predictions set prob_up=0.9 where id=1`], false);
await t("grading before target_time rejected (target in the past) accepted", [`update predictions set price_at_target=101, move=0.01, outcome='HIT', hit=true where id=1`], true);
await t("re-grading rejected", [`update predictions set outcome='MISS', hit=false where id=1`], false);
await t("delete rejected", [`delete from predictions where id=1`], false);
await t("truncate rejected", [`truncate predictions`], false);
await t("inconsistent outcome/hit rejected", [`update predictions set price_at_target=100, move=0, outcome='HIT', hit=true where coin='ETH'`], false);
await t("NO_CALL graded SAT_OUT accepted", [`update predictions set price_at_target=100.05, move=0.0005, outcome='SAT_OUT', hit=null where coin='ETH'`], true);
await t("insert UP for flat test", [now(base + 3*H + 60e3), ins({ coin: "BTC", close: base + 3*H })], true);
await t("UP with +0.05% graded HIT rejected (must be FLAT)", [`update predictions set price_at_target=100.05, move=0.0005, outcome='HIT', hit=true where candle_close_time='${iso(base+3*H)}'`], false);
await t("move not matching prices rejected", [`update predictions set price_at_target=100.05, move=0.02, outcome='HIT', hit=true where candle_close_time='${iso(base+3*H)}'`], false);
await t("UP with +0.05% graded FLAT accepted", [`update predictions set price_at_target=100.05, move=0.0005, outcome='FLAT', hit=null where candle_close_time='${iso(base+3*H)}'`], true);
// future target: grading must be refused by the real clock
await t("future-dated insert for grading test", [now(Date.UTC(2030,0,1,0,5)), ins({ coin: "SOL", close: Date.UTC(2030,0,1) })], true);
await t("grading before target_time rejected", [`update predictions set price_at_target=1, move=0.01, outcome='HIT', hit=true where coin='SOL'`], false);
await t("anon cannot insert", [`set role anon`, ins({ coin: "SOL", close: base + 7*H })], false);
await db.query(`reset role`);
await t("missed run logged once", [`insert into run_log (job,candle_close_time,status) values ('predict','${iso(base)}','missed')`], true);
await t("second predict log for same hour rejected", [`insert into run_log (job,candle_close_time,status) values ('predict','${iso(base)}','ok')`], false);

// ---------------- engine v3 (score/threshold rule, 12h)
const ins3 = ({ coin = "BTC", close = base + 20 * H, pu = 0.40, pd = 0.10, thr = 0.16, sig = "UP", h = "12h", tgtH = 12, score }) =>
  `insert into predictions (coin,horizon,prob_up,signal,price_at_call,candle_close_time,target_time,model_version,p_big_up,p_big_down,score,threshold,k)
   values ('${coin}','${h}',${pu},'${sig}',100,'${iso(close)}','${iso(close + tgtH * H)}','v3',${pu},${pd},${score ?? (pu - pd)},${thr},0.01)`;
await t("v3 UP (score 0.30 > 0.16) accepted", [now(base + 20 * H + 60e3), ins3({})], true);
await t("v3 UP below threshold rejected", [ins3({ coin: "ETH", pu: 0.2, pd: 0.1 })], false);
await t("v3 NO_CALL inside band accepted", [ins3({ coin: "ETH", pu: 0.2, pd: 0.1, sig: "NO_CALL" })], true);
await t("v3 DOWN (score -0.25) accepted", [ins3({ coin: "SOL", pu: 0.05, pd: 0.30, sig: "DOWN" })], true);
await t("v3 score not equal p_up - p_down rejected", [now(base + 21 * H + 60e3), ins3({ score: 0.9, close: base + 21 * H })], false);
await t("v3 12h with wrong target rejected", [ins3({ close: base + 21 * H, tgtH: 4 })], false);
await t("v3 prob_up must equal p_big_up", [`insert into predictions (coin,horizon,prob_up,signal,price_at_call,candle_close_time,target_time,model_version,p_big_up,p_big_down,score,threshold,k)
   values ('BTC','12h',0.9,'UP',100,'${iso(base + 21 * H)}','${iso(base + 33 * H)}','v3',0.4,0.1,0.3,0.16,0.01)`], false);
await t("v3 threshold edit rejected", [`update predictions set threshold=0.01 where model_version='v3' and coin='BTC'`], false);

// ---------------- trust v1 (provenance + lifecycle)
const ins4 = ({ coin = "BTC", close = base + 40 * H, prov = "'live_prospective'", gen, start, cutoff }) =>
  `insert into predictions (coin,horizon,prob_up,signal,price_at_call,candle_close_time,target_time,model_version,p_big_up,p_big_down,score,threshold,k,provenance,job_started_at,input_cutoff_at,generated_at,run_id,late_rule)
   values ('${coin}','12h',0.2,'NO_CALL',100,'${iso(close)}','${iso(close + 12 * H)}','v3',0.2,0.1,0.1,0.16,0.01,${prov},
   '${iso(start ?? close + 60e3)}','${iso(cutoff ?? close)}','${iso(gen ?? close + 90e3)}','123/1','late-v1')`;
await t("trust: live_prospective with ordered lifecycle accepted", [now(base + 40 * H + 3 * 60e3), ins4({})], true);
await t("trust: provenance 'demo' rejected (demo can never enter live table)", [ins4({ coin: "ETH", prov: "'demo'" })], false);
await t("trust: provenance 'backtest' rejected", [ins4({ coin: "ETH", prov: "'backtest'" })], false);
await t("trust: legacy NULL provenance still accepted (not assumed live)", [ins4({ coin: "ETH", prov: "null" })], true);
await t("trust: generated_at after DB insert (+10 min) rejected", [ins4({ coin: "SOL", gen: base + 40 * H + 13 * 60e3 })], false);
await t("trust: input cutoff after candle close rejected", [ins4({ coin: "SOL", cutoff: base + 40 * H + 60e3 })], false);
await t("trust: generated before job start rejected", [ins4({ coin: "SOL", start: base + 40 * H + 10 * 60e3, gen: base + 40 * H + 60e3 })], false);
await t("trust: provenance edit rejected", [`update predictions set provenance=null where candle_close_time='${iso(base + 40 * H)}' and coin='BTC'`], false);
await t("trust: generated_at edit rejected", [`update predictions set generated_at=candle_close_time where candle_close_time='${iso(base + 40 * H)}' and coin='BTC'`], false);
console.log(`\n${ok} passed, ${bad} failed`);
if (bad) process.exit(1);
