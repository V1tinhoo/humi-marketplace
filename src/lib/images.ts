/**
 * Hosts listed in next.config.ts `images.remotePatterns`. Images from anywhere else
 * (e.g. a provider we haven't listed) are rendered with `unoptimized` instead of crashing.
 * Keep this in sync with next.config.ts.
 */
export function isOptimizableImage(src: string) {
  if (src.startsWith("blob:") || src.startsWith("data:")) return false;
  try {
    const { protocol, hostname, pathname } = new URL(src);
    if (protocol !== "https:") return false;
    return (
      hostname === "images.unsplash.com" ||
      hostname.endsWith(".googleusercontent.com") ||
      (hostname.endsWith(".supabase.co") && pathname.startsWith("/storage/v1/object/public/"))
    );
  } catch {
    return false;
  }
}
