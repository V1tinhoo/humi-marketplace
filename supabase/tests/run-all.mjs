// Runs every database test against the migrations it needs (npm run db:test).
// Each test gets the migrations in order up to and including its own (the storage migration
// only for its own test, since it needs Supabase's storage schema).
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";

const dir = "supabase/migrations";
const all = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const upTo = (name) => all.slice(0, all.indexOf(name) + 1).filter((f) => !f.includes("avatar_storage")).map((f) => `${dir}/${f}`);

/** test file → last migration it needs */
const tests = [
  ["schema.test.mjs", "20261114120000_humi_initial_schema.sql"],
  ["backfill.test.mjs", "20261114130000_profile_backfill.sql"],
  ["storage.test.mjs", null],
  ["oauth.test.mjs", "20261114150000_oauth_profiles.sql"],
  ["region.test.mjs", "20261115100000_profile_region.sql"],
  ["presence.test.mjs", "20261115110000_host_presence.sql"],
  ["timezone.test.mts", "20261115110000_host_presence.sql"],
  ["billing.test.mjs", "20261115130000_hide_commission.sql"],
  ["reports.test.mjs", "20261115140000_user_reports.sql"],
  ["sessions.test.mjs", "20261115150000_count_call_sessions.sql"],
  ["ratings.test.mjs", "20261115160000_call_ratings.sql"],
  ["topups.test.mjs", "20261115170000_mercadopago_topups.sql"],
  ["live.test.mjs", "20261115180000_live_money.sql"],
  ["payouts.test.mjs", "20261116100000_host_payouts.sql"],
  ["online.test.mjs", "20261116110000_online_default_price_range.sql"],
  ["admin.test.mjs", "20261116120000_admin.sql"],
  ["price-min.test.mjs", "20261116130000_price_min_30.sql"],
  ["growth.test.mjs", "20261116140000_growth.sql"],
];

let failed = 0;
for (const [test, last] of tests) {
  const args = last ? upTo(last) : [`${dir}/20261114140000_avatar_storage.sql`];
  console.log(`\n=== ${test} ===`);
  const r = spawnSync(process.execPath, [`supabase/tests/${test}`, ...args], { stdio: "inherit" });
  if (r.status !== 0) {
    failed++;
    console.log(`*** ${test} FAILED`);
  }
}
console.log(failed ? `\n${failed} test file(s) failed` : `\nall ${tests.length} test files passed`);
process.exit(failed ? 1 : 0);
