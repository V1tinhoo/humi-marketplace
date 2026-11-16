import type { Metadata } from "next";

export const metadata: Metadata = { title: "Host dashboard" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
