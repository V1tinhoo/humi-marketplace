import type { Metadata } from "next";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("Log in") };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
