/** SAMPLE DATA — fictional reviews for demonstration only. */
import type { Review } from "@/types";

const pool: Omit<Review, "id" | "hostId">[] = [
  { author: "Hannah", country: "Germany", rating: 5, date: "2026-10-28", category: "talk", text: "Felt like catching up with an old friend. Thirty minutes went by in what felt like five." },
  { author: "Kenji", country: "Japan", rating: 5, date: "2026-10-19", category: "cultures", text: "Patient, funny, and genuinely curious about my life in Osaka. I learned so much without it ever feeling like a lesson." },
  { author: "Lucas", country: "France", rating: 4, date: "2026-10-04", category: "play", text: "Great teammate and very easygoing. We lost every match and still had a brilliant time." },
  { author: "Ana", country: "Mexico", rating: 5, date: "2026-09-22", category: "meet", text: "I moved to a new city and wanted to talk to someone outside work. This was exactly the easy, friendly conversation I needed." },
  { author: "Sam", country: "Australia", rating: 5, date: "2026-09-10", category: "talk", text: "Really good listener and asks great questions. Already booked another session." },
  { author: "Ingrid", country: "Norway", rating: 5, date: "2026-08-30", category: "cultures", text: "My confidence speaking went up a lot after three sessions. Relaxed, warm, never awkward." },
];

export function reviewsForHost(hostId: string, count = 4): Review[] {
  const seed = [...hostId].reduce((a, c) => a + c.charCodeAt(0), 0);
  return Array.from({ length: count }, (_, i) => {
    const r = pool[(seed + i) % pool.length];
    return { ...r, id: `${hostId}-r${i}`, hostId };
  });
}
