/** SAMPLE DATA — demonstration figures for the host dashboard concept. */

export const earningsByWeek = [
  { label: "Sep 22", value: 42 },
  { label: "Sep 29", value: 58 },
  { label: "Oct 6", value: 51 },
  { label: "Oct 13", value: 73 },
  { label: "Oct 20", value: 66 },
  { label: "Oct 27", value: 88 },
  { label: "Nov 3", value: 79 },
  { label: "Nov 10", value: 96 },
];

export const upcomingBookings = [
  { id: "b1", guest: "Hannah", country: "Germany", format: "video", duration: 30, when: "Today · 19:00", topic: "Travel stories" },
  { id: "b2", guest: "Kenji", country: "Japan", format: "audio", duration: 60, when: "Tomorrow · 08:00", topic: "Portuguese practice" },
  { id: "b3", guest: "Lucas", country: "France", format: "audio", duration: 30, when: "Thu · 20:00", topic: "Co-op gaming" },
  { id: "b4", guest: "Ana", country: "Mexico", format: "video", duration: 20, when: "Sat · 15:00", topic: "Just talk" },
] as const;

export const completedSessions = [
  { id: "c1", guest: "Sam", country: "Australia", duration: 30, date: "Nov 12", earned: 5.4, rating: 5 },
  { id: "c2", guest: "Ingrid", country: "Norway", duration: 60, date: "Nov 11", earned: 9.99, rating: 5 },
  { id: "c3", guest: "Lucas", country: "France", duration: 30, date: "Nov 9", earned: 5.4, rating: 4 },
  { id: "c4", guest: "Priyanka", country: "UAE", duration: 20, date: "Nov 8", earned: 4.05, rating: 5 },
  { id: "c5", guest: "Tom", country: "Ireland", duration: 30, date: "Nov 6", earned: 6.3, rating: 5 },
];

export const payouts = [
  { id: "p1", date: "Nov 1, 2026", amount: 284.6, status: "Paid (sample)" },
  { id: "p2", date: "Oct 1, 2026", amount: 231.15, status: "Paid (sample)" },
  { id: "p3", date: "Sep 1, 2026", amount: 198.4, status: "Paid (sample)" },
];

/** Host earnings share after HUMI's commission (demo assumption). */
export const HOST_SHARE = 0.8; // host keeps 80%, HUMI commission 20% (same as platform_settings.commission_bps)
