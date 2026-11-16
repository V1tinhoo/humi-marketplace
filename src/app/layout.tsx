import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { BetaBar } from "@/components/layout/BetaBar";
import { IncomingCalls } from "@/components/call/IncomingCalls";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: "HUMI — Real people. Real connections.", template: "%s · HUMI" },
  description:
    "HUMI is a global marketplace to talk, play, practice languages and share moments with real people around the world.",
};

export const viewport: Viewport = {
  themeColor: "#FFF9FC",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-dvh antialiased">
        <AuthProvider>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-plum focus:px-4 focus:py-2 focus:text-white"
          >
            Skip to content
          </a>
          <BetaBar />
          <Navbar />
          <main id="main">{children}</main>
          <Footer />
          <IncomingCalls />
        </AuthProvider>
      </body>
    </html>
  );
}
