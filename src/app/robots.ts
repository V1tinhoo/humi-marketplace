import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/** Private areas: nothing useful for search engines or AI assistants. */
const PRIVATE = ["/account", "/admin", "/wallet", "/dashboard", "/call", "/api/", "/auth/", "/book/", "/reset-password", "/forgot-password"];

/**
 * Search engines AND AI assistants are welcome: being read by them is how HUMI gets cited
 * when someone asks "where can I talk with real people / practise English online?".
 */
const AI_BOTS = [
  "GPTBot", "OAI-SearchBot", "ChatGPT-User", // OpenAI / ChatGPT
  "ClaudeBot", "Claude-SearchBot", "Claude-User", // Anthropic / Claude
  "PerplexityBot", "Perplexity-User", // Perplexity
  "Google-Extended", "Googlebot", "Bingbot", // Gemini, Google, Bing / Copilot
  "Applebot", "Applebot-Extended", "Amazonbot", "DuckAssistBot", "meta-externalagent", "CCBot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      ...AI_BOTS.map((userAgent) => ({ userAgent, allow: "/", disallow: PRIVATE })),
      { userAgent: "*", allow: "/", disallow: PRIVATE },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
