/**
 * Time-zone conversion tests for the booking slot logic (src/lib/time.ts).
 * Run: npm run test:time
 */
import { buildSlots, dayShift, describeInZone, groupByViewerDay, timeInZone, zonedTimeToDate } from "../src/lib/time.ts";

let fail = 0;
const check = (name: string, cond: boolean, info?: unknown) => {
  console.log(cond ? "  PASS" : "  FAIL", name, cond ? "" : JSON.stringify(info));
  if (!cond) fail++;
};

/** Slots a host offers at `hour` (host-local) on `weekdayIndex` (0 = Monday), seen from `viewerTz`. */
function scenario(hostTz: string, weekdayIndex: number, hour: number, viewerTz: string, now: Date) {
  const hostDays = buildSlots({ availability: { [weekdayIndex]: [hour] }, timeZone: hostTz, durationMinutes: 30, days: 9, now, minLeadMinutes: 0 });
  const slots = hostDays.flatMap((d) => d.slots);
  const viewerDays = groupByViewerDay(slots, viewerTz, 7, now);
  const first = viewerDays.flatMap((d) => d.slots)[0];
  const dayOfFirst = viewerDays.find((d) => d.slots.includes(first));
  return { first, dayOfFirst };
}

console.log("\n1. Your example: host São Paulo 21:00, customer New York (offset 2h)");
{
  const now = new Date("2026-11-16T12:00:00Z"); // a Monday; NY is on EST (UTC-5), São Paulo UTC-3
  const { first, dayOfFirst } = scenario("America/Sao_Paulo", 1 /* Tue */, 21, "America/New_York", now);
  check("customer sees 19:00", timeInZone(first.start, "America/New_York") === "19:00", timeInZone(first.start, "America/New_York"));
  check("host still sees 21:00", timeInZone(first.start, "America/Sao_Paulo") === "21:00");
  check("stored instant is 00:00 UTC next day", first.start.toISOString() === "2026-11-18T00:00:00.000Z", first.start.toISOString());
  check("same calendar day for both (Tue 17)", dayOfFirst?.day === 17 && dayShift(first.start, "America/New_York", "America/Sao_Paulo") === 0);
  console.log("     customer:", describeInZone(first.start, "America/New_York"), "| host:", describeInZone(first.start, "America/Sao_Paulo"));
}

console.log("\n2. Different calendar dates: host São Paulo 21:00, customer Lisbon");
{
  const now = new Date("2026-11-16T12:00:00Z");
  const { first, dayOfFirst } = scenario("America/Sao_Paulo", 1, 21, "Europe/Lisbon", now);
  check("customer sees 00:00", timeInZone(first.start, "Europe/Lisbon") === "00:00", timeInZone(first.start, "Europe/Lisbon"));
  check("listed under the customer's NEXT day (Wed 18)", dayOfFirst?.day === 18, dayOfFirst);
  check("host time flagged as previous day (−1)", dayShift(first.start, "Europe/Lisbon", "America/Sao_Paulo") === -1);
}

console.log("\n3. Customer behind the host by a day: host Tokyo Mon 09:00, customer Los Angeles");
{
  const now = new Date("2026-11-16T00:00:00Z");
  const { first, dayOfFirst } = scenario("Asia/Tokyo", 0 /* Mon */, 9, "America/Los_Angeles", now);
  check("customer sees 16:00", timeInZone(first.start, "America/Los_Angeles") === "16:00", timeInZone(first.start, "America/Los_Angeles"));
  const p = first.start.toLocaleDateString("en-US", { weekday: "short", timeZone: "America/Los_Angeles" });
  check("on Sunday for the customer", p === "Sun", p);
  check("host time flagged next day (+1)", dayShift(first.start, "America/Los_Angeles", "Asia/Tokyo") === 1);
  check("grouped under that Sunday", dayOfFirst !== undefined);
}

console.log("\n4. Half-hour offset: host Kolkata 10:00, customer London");
{
  const now = new Date("2026-11-16T00:00:00Z");
  const { first } = scenario("Asia/Kolkata", 2, 10, "Europe/London", now);
  check("customer sees 04:30", timeInZone(first.start, "Europe/London") === "04:30", timeInZone(first.start, "Europe/London"));
}

console.log("\n5. Daylight saving END: host New York Mon 09:00, customer São Paulo");
{
  // US DST ends Sun 2026-11-01. Week before: EDT (UTC-4). Week after: EST (UTC-5).
  const before = scenario("America/New_York", 0, 9, "America/Sao_Paulo", new Date("2026-10-25T12:00:00Z")).first;
  const after = scenario("America/New_York", 0, 9, "America/Sao_Paulo", new Date("2026-11-01T12:00:00Z")).first;
  check("Oct 26 (EDT): 09:00 NY = 10:00 São Paulo", timeInZone(before.start, "America/Sao_Paulo") === "10:00", timeInZone(before.start, "America/Sao_Paulo"));
  check("Nov 2 (EST): 09:00 NY = 11:00 São Paulo", timeInZone(after.start, "America/Sao_Paulo") === "11:00", timeInZone(after.start, "America/Sao_Paulo"));
  check("host keeps 09:00 on both weeks", timeInZone(before.start, "America/New_York") === "09:00" && timeInZone(after.start, "America/New_York") === "09:00");
}

console.log("\n6. Daylight saving START (both hemispheres): host London Sun 09:00, customer Sydney");
{
  // UK DST starts Sun 2026-03-29 01:00 UTC; Sydney still on AEDT (UTC+11) until 2026-04-05.
  const s = scenario("Europe/London", 6 /* Sun */, 9, "Australia/Sydney", new Date("2026-03-28T00:00:00Z")).first;
  check("instant = 08:00 UTC (BST)", s.start.toISOString() === "2026-03-29T08:00:00.000Z", s.start.toISOString());
  check("customer sees 19:00 Sydney", timeInZone(s.start, "Australia/Sydney") === "19:00", timeInZone(s.start, "Australia/Sydney"));
}

console.log("\n7. Same instant for both people");
{
  const t = zonedTimeToDate(2026, 12, 1, 21, 0, "America/Sao_Paulo");
  const asNY = timeInZone(t, "America/New_York");
  const back = zonedTimeToDate(2026, 12, 1, Number(asNY.slice(0, 2)), Number(asNY.slice(3)), "America/New_York");
  check("São Paulo 21:00 ↔ New York 19:00 round-trip to the identical instant", back.getTime() === t.getTime(), [t.toISOString(), back.toISOString()]);
}

console.log(fail ? `\n${fail} failed` : "\nall passed");
process.exit(fail ? 1 : 0);
