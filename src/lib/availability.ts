import type { WeeklyAvailability } from "@/types";

/** Pure helper (safe in client and server code). */
/** DB windows (0 = Sunday, "HH:MM:SS") → app hours keyed 0 = Monday. */
export function windowsToWeekly(windows: { day_of_week: number; start_time: string; end_time: string }[]): WeeklyAvailability {
  const out: WeeklyAvailability = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  for (const w of windows) {
    const key = (w.day_of_week + 6) % 7;
    const [sh, sm] = w.start_time.split(":").map(Number);
    const [eh, em] = w.end_time.split(":").map(Number);
    const startMin = sh * 60 + sm;
    const endMin = eh * 60 + em;
    for (let h = Math.ceil(startMin / 60); (h + 1) * 60 <= endMin; h++) out[key].push(h);
  }
  for (const k of Object.keys(out)) out[Number(k)] = Array.from(new Set(out[Number(k)])).sort((a, b) => a - b);
  return out;
}
