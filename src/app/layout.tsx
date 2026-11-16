import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { IncomingCalls } from "@/components/call/IncomingCalls";
import { Analytics } from "@/components/analytics/Analytics";
import { cookies, headers } from "next/headers";
import { I18nProvider } from "@/i18n/client";
import { COUNTRY_COOKIE } from "@/i18n";
import { getLocale } from "@/i18n/server";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const pt = (await getLocale()) === "pt";
  // Absolute links for previews: the address the site is being opened on (humi.chat, vercel.app…).
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const title = pt ? "HUMI — Pessoas reais. Conexões reais." : "HUMI — Real people. Real connections.";
  const description = pt
    ? "Converse por vídeo ou áudio com pessoas reais do mundo todo: bater papo, praticar idiomas, jogar e trocar experiências."
    : "Talk by video or audio with real people around the world: chat, practise languages, play and share experiences.";
  return {
    metadataBase: new URL(`${proto}://${host}`),
    title: { default: title, template: "%s · HUMI" },
    description,
    openGraph: { type: "website", siteName: "HUMI", title, description, locale: pt ? "pt_BR" : "en_US", url: "/" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export const viewport: Viewport = {
  themeColor: "#FFF9FC",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  const country = (await cookies()).get(COUNTRY_COOKIE)?.value ?? null;
  return (
    <html lang={locale === "pt" ? "pt-BR" : "en"} className={inter.variable}>
      <body className="min-h-dvh antialiased">
        <I18nProvider locale={locale} country={country}>
        <AuthProvider>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-plum focus:px-4 focus:py-2 focus:text-white"
          >
            {locale === "pt" ? "Pular para o conteúdo" : "Skip to content"}
          </a>
          <Navbar />
          <main id="main">{children}</main>
          <Footer />
          <IncomingCalls />
          <Analytics />
        </AuthProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
