import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { BetaBar } from "@/components/layout/BetaBar";
import { IncomingCalls } from "@/components/call/IncomingCalls";
import { cookies } from "next/headers";
import { I18nProvider } from "@/i18n/client";
import { COUNTRY_COOKIE } from "@/i18n";
import { getLocale } from "@/i18n/server";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const pt = (await getLocale()) === "pt";
  return {
    title: { default: pt ? "HUMI — Pessoas reais. Conexões reais." : "HUMI — Real people. Real connections.", template: "%s · HUMI" },
    description: pt
      ? "O HUMI é um marketplace global para conversar, jogar, praticar idiomas e dividir momentos com pessoas reais do mundo todo."
      : "HUMI is a global marketplace to talk, play, practice languages and share moments with real people around the world.",
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
          <BetaBar />
          <Navbar />
          <main id="main">{children}</main>
          <Footer />
          <IncomingCalls />
        </AuthProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
