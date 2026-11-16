/**
 * Seeds the 14 fictional sample hosts into Supabase so the marketplace isn't empty.
 *
 *   npm run db:seed            create / update sample hosts
 *   npm run db:seed -- --remove   delete them again (do this before launch)
 *
 * Runs ONLY on your machine with SUPABASE_SERVICE_ROLE_KEY from .env.local.
 * Sample profiles are flagged `is_sample = true` and shown with a "Sample" badge.
 * Ratings and session counts start at zero — no fake reviews are created.
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { hosts } from "../src/data/hosts.ts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const emailFor = (id: string) => `sample-host+${id}@example.com`;

async function findUserIdByEmail(email: string) {
  for (let page = 1; page < 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email === email);
    if (hit) return hit.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

/** App availability (0 = Monday → hours) → DB windows (0 = Sunday). */
function toWindows(availability: Record<number, number[]>, hostId: string, timezone: string) {
  const rows: { host_id: string; day_of_week: number; start_time: string; end_time: string; timezone: string }[] = [];
  for (const [key, hours] of Object.entries(availability)) {
    const sorted = [...hours].sort((a, b) => a - b);
    let start: number | null = null;
    let prev = -2;
    for (const h of [...sorted, Infinity]) {
      if (h !== prev + 1) {
        if (start !== null) {
          const end = prev + 1;
          rows.push({
            host_id: hostId,
            day_of_week: (Number(key) + 1) % 7,
            start_time: `${String(start).padStart(2, "0")}:00`,
            end_time: end === 24 ? "24:00" : `${String(end).padStart(2, "0")}:00`,
            timezone,
          });
        }
        start = h;
      }
      prev = h;
    }
  }
  return rows;
}

async function remove() {
  for (const h of hosts) {
    const id = await findUserIdByEmail(emailFor(h.id));
    if (!id) continue;
    const { error } = await admin.auth.admin.deleteUser(id);
    console.log(error ? `✗ ${h.firstName}: ${error.message}` : `– removed ${h.firstName}`);
  }
}

async function seed() {
  for (const h of hosts) {
    const email = emailFor(h.id);
    let userId = await findUserIdByEmail(email);
    if (!userId) {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: randomBytes(24).toString("base64url"), // never used — sample accounts can't be logged into
        email_confirm: true,
        user_metadata: { full_name: h.firstName, role: "host" },
      });
      if (error || !data.user) throw new Error(`${h.firstName}: ${error?.message}`);
      userId = data.user.id;
    }

    const p = await admin
      .from("profiles")
      .update({ avatar_url: h.photo, bio: h.bio, country: h.country, city: h.city, languages: h.languages, interests: h.interests, is_sample: true })
      .eq("id", userId);
    if (p.error) throw new Error(`${h.firstName} profile: ${p.error.message}`);

    const hp = await admin
      .from("host_profiles")
      .update({
        display_name: h.firstName,
        tagline: h.tagline,
        description: h.bio,
        session_price: h.pricePer30,
        categories: h.categories,
        call_types: h.formats,
        timezone: h.timezone,
        is_available: h.online,
        is_published: true,
      })
      .eq("user_id", userId)
      .select("id")
      .single();
    if (hp.error || !hp.data) throw new Error(`${h.firstName} host profile: ${hp.error?.message}`);

    await admin.from("host_availability").delete().eq("host_id", hp.data.id);
    const av = await admin.from("host_availability").insert(toWindows(h.availability, hp.data.id, h.timezone));
    if (av.error) throw new Error(`${h.firstName} availability: ${av.error.message}`);

    console.log(`✓ ${h.firstName} (${h.country})`);
  }
  console.log("\nDone. Sample hosts are marked is_sample = true. Remove them before launch with: npm run db:seed -- --remove");
}

(process.argv.includes("--remove") ? remove() : seed()).catch((e) => {
  console.error("Seed failed:", e.message ?? e);
  process.exit(1);
});
