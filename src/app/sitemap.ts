import type { MetadataRoute } from "next";
import { getHosts } from "@/lib/data/hosts";
import { SITE_URL } from "@/lib/site";

export const revalidate = 3600;

const PAGES: [path: string, priority: number, freq: "daily" | "weekly" | "monthly"][] = [
  ["/", 1, "daily"],
  ["/explore", 0.9, "daily"],
  ["/pratique-idiomas", 0.9, "weekly"],
  ["/how-it-works", 0.8, "monthly"],
  ["/help", 0.8, "monthly"],
  ["/become-a-host", 0.8, "monthly"],
  ["/about", 0.7, "monthly"],
  ["/safety", 0.6, "monthly"],
  ["/guidelines", 0.5, "monthly"],
  ["/terms", 0.3, "monthly"],
  ["/privacy", 0.3, "monthly"],
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const pages: MetadataRoute.Sitemap = PAGES.map(([path, priority, changeFrequency]) => ({ url: `${SITE_URL}${path}`, lastModified: now, changeFrequency, priority }));
  let hosts: MetadataRoute.Sitemap = [];
  try {
    const { data } = await getHosts();
    hosts = data
      .filter((h) => !h.isSample)
      .map((h) => ({ url: `${SITE_URL}/hosts/${h.id}`, lastModified: now, changeFrequency: "weekly" as const, priority: 0.6 }));
  } catch {
    /* hosts are optional in the sitemap */
  }
  return [...pages, ...hosts];
}
