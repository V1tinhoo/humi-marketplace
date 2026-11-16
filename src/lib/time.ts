/**
 * Time-zone helpers built on Intl (no extra dependency).
 * Host availability is expressed in the host's IANA time zone; bookings are stored as UTC instants.
 */

type Parts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function formatter(timeZone: string) {
  let f = fmtCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    fmtCache.set(timeZone, f);
  }
  return f;
}

export function zonedParts(date: Date, timeZone: string): Parts {
  const map: Record<string, number> = {};
  for (const p of formatter(timeZone).formatToParts(date)) if (p.type !== "literal") map[p.type] = Number(p.value);
  return { year: map.year, month: map.month, day: map.day, hour: map.hour % 24, minute: map.minute, second: map.second };
}

function offsetMs(date: Date, timeZone: string) {
  const p = zonedParts(date, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - date.getTime();
}

/** Converts a wall-clock time in `timeZone` to the matching instant. Month is 1-based. */
export function zonedTimeToDate(year: number, month: number, day: number, hour: number, minute: number, timeZone: string) {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  let ts = guess - offsetMs(new Date(guess), timeZone);
  const second = guess - offsetMs(new Date(ts), timeZone); // handles DST boundaries
  if (second !== ts) ts = second;
  return new Date(ts);
}

/** "GMT-3"-style label for a time zone. */
export function tzLabel(timeZone: string, at = new Date()) {
  try {
    const part = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "shortOffset" })
      .formatToParts(at)
      .find((p) => p.type === "timeZoneName");
    return part?.value ?? timeZone;
  } catch {
    return timeZone;
  }
}

export function isValidTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export interface Slot {
  start: Date;
  hour: number; // host-local start hour
  taken: boolean;
}
export interface SlotDay {
  /** Host-local calendar date */
  year: number;
  month: number;
  day: number;
  weekdayIndex: number; // 0 = Monday (app convention)
  slots: Slot[];
}

/**
 * Builds bookable slots for the next `days` days from weekly availability
 * (keys: 0 = Monday, values: host-local start hours) and busy ranges.
 */
export function buildSlots(opts: {
  availability: Record<number, number[]>;
  timeZone: string;
  durationMinutes: number;
  busy?: { start: number; end: number }[];
  days?: number;
  now?: Date;
  minLeadMinutes?: number;
}): SlotDay[] {
  const { availability, timeZone, durationMinutes, busy = [], days = 7, now = new Date(), minLeadMinutes = 60 } = opts;
  const today = zonedParts(now, timeZone);
  const earliest = now.getTime() + minLeadMinutes * 60_000;

  return Array.from({ length: days }, (_, offset) => {
    // Calendar arithmetic on a UTC date avoids local DST surprises.
    const d = new Date(Date.UTC(today.year, today.month - 1, today.day + offset));
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth() + 1;
    const day = d.getUTCDate();
    const weekdayIndex = (d.getUTCDay() + 6) % 7;
    const slots = (availability[weekdayIndex] ?? [])
      .map((hour) => {
        const start = zonedTimeToDate(year, month, day, hour, 0, timeZone);
        const s = start.getTime();
        const e = s + durationMinutes * 60_000;
        return { start, hour, taken: busy.some((b) => s < b.end && e > b.start), ok: s >= earliest };
      })
      .filter((x) => x.ok)
      .map(({ start, hour, taken }) => ({ start, hour, taken }));
    return { year, month, day, weekdayIndex, slots };
  });
}

export const pad2 = (n: number) => String(n).padStart(2, "0");

/** The visitor's IANA time zone (browser setting), falling back to UTC. */
export function viewerTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** "19:00" for an instant in a given zone (24-hour clock). */
export function timeInZone(date: Date, timeZone: string) {
  const p = zonedParts(date, timeZone);
  return `${pad2(p.hour)}:${pad2(p.minute)}`;
}

/** Calendar-day difference of the same instant between two zones (e.g. +1 = "next day" in `toTz`). */
export function dayShift(date: Date, fromTz: string, toTz: string) {
  const a = zonedParts(date, fromTz);
  const b = zonedParts(date, toTz);
  return Math.round((Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86_400_000);
}

/** Full local description, e.g. "Sat, Nov 21, 19:00 (GMT-5)". */
export function describeInZone(date: Date, timeZone: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" }) {
  const day = date.toLocaleDateString("en-US", { ...opts, timeZone });
  return `${day}, ${timeInZone(date, timeZone)} (${tzLabel(timeZone, date)})`;
}

export interface ViewerDay {
  /** Calendar date in the viewer's zone */
  year: number;
  month: number;
  day: number;
  slots: Slot[];
}

/**
 * Regroups host-generated slots by the VIEWER's calendar date, so a 21:00 São Paulo slot
 * that is 01:00 next day in Lisbon appears under the Lisbon date. Returns `days` consecutive
 * viewer dates starting today (empty days included, so the strip stays continuous).
 */
export function groupByViewerDay(slots: Slot[], viewerTz: string, days = 7, now = new Date()): ViewerDay[] {
  const today = zonedParts(now, viewerTz);
  const out: ViewerDay[] = Array.from({ length: days }, (_, i) => {
    const d = new Date(Date.UTC(today.year, today.month - 1, today.day + i));
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), slots: [] };
  });
  const index = new Map(out.map((d, i) => [`${d.year}-${d.month}-${d.day}`, i]));
  for (const s of [...slots].sort((a, b) => a.start.getTime() - b.start.getTime())) {
    const p = zonedParts(s.start, viewerTz);
    const i = index.get(`${p.year}-${p.month}-${p.day}`);
    if (i !== undefined) out[i].slots.push(s);
  }
  return out;
}
