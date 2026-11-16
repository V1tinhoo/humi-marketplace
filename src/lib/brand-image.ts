/**
 * Brand assets for generated images (share preview, app icon): the exact logo mark used on
 * the site and the Inter font, so previews look like the real HUMI logo.
 */

/** Same drawing as <LogoMark /> (src/components/brand/Logo.tsx). */
export const LOGO_MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 28">
  <circle cx="14" cy="14" r="11" fill="#B9A7EF"/>
  <circle cx="26" cy="14" r="11" fill="#E9BFD3" style="mix-blend-mode:multiply"/>
  <path d="M20 4.8a11 11 0 0 1 0 18.4a11 11 0 0 1 0-18.4Z" fill="#493C62"/>
</svg>`;

export const LOGO_MARK_DATA_URI = `data:image/svg+xml;base64,${Buffer.from(LOGO_MARK_SVG).toString("base64")}`;

/**
 * Inter (the site's font) for generated images. Google Fonts serves TrueType to plain
 * server requests; if the download fails the image still renders with the default font.
 */
async function interWeight(weight: number) {
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=Inter:wght@${weight}`, { cache: "force-cache" })).text();
    const url = css.match(/src: url\(([^)]+)\) format\('(?:truetype|opentype)'\)/)?.[1];
    if (!url) return null;
    const data = await (await fetch(url, { cache: "force-cache" })).arrayBuffer();
    return { name: "Inter", data, weight: weight as 400 | 500 | 600 | 700 | 800, style: "normal" as const };
  } catch {
    return null;
  }
}

export async function brandFonts() {
  const fonts = await Promise.all([interWeight(500), interWeight(600), interWeight(800)]);
  return fonts.filter((f): f is NonNullable<typeof f> => f !== null);
}
