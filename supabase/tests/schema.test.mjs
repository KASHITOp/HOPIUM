import { PGlite } from "@electric-sql/pglite";
import fs from "fs";
const db = new PGlite();
await db.exec(`create role anon; create role authenticated;`);
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
console.log(`\n${ok} passed, ${bad} failed`);
if (bad) process.exit(1);
