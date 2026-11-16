import { NextResponse, type NextRequest } from "next/server";
import { allCountries } from "country-region-data";
import { COUNTRY_CODES } from "@/data/places";

/**
 * GET /api/regions?country=Brazil  →  { regions: ["Acre", "Alagoas", …, "Tocantins"] }
 * States / provinces / regions for one country (country-region-data, MIT).
 * Served from the server so the ~600 KB dataset never reaches the browser.
 */
const byCode = new Map<string, string[]>(allCountries.map(([, code, regions]) => [code, regions.map(([name]) => name)]));

// Postal codes for US military mail aren't places people live in.
const EXCLUDE = /^Armed Forces /;

export async function GET(request: NextRequest) {
  const country = request.nextUrl.searchParams.get("country") ?? "";
  const code = COUNTRY_CODES[country];
  if (!code) return NextResponse.json({ regions: [] }, { status: country ? 404 : 400 });

  const regions = (byCode.get(code) ?? [])
    .filter((r) => !EXCLUDE.test(r))
    .sort((a, b) => a.localeCompare(b, "en"));
  return NextResponse.json(
    { regions },
    { headers: { "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800" } },
  );
}
