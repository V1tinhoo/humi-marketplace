import { ImageResponse } from "next/og";
import { LOGO_MARK_DATA_URI, brandFonts } from "@/lib/brand-image";

/** Share preview image (WhatsApp, Instagram, Discord, Telegram, X…): HUMI brand, in Portuguese. */
export const alt = "HUMI — Pessoas reais. Conexões reais.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  const fonts = await brandFonts();
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "linear-gradient(135deg, #FFF9FC 0%, #FCEAF2 45%, #E5DDFB 100%)",
          color: "#493C62",
          fontFamily: "Inter, sans-serif",
        }}
      >
        {/* Real logo: mark + "humi" wordmark, as on the site */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- rendered to PNG by next/og */}
          <img src={LOGO_MARK_DATA_URI} width={100} height={70} alt="" />
          <div style={{ fontSize: 64, fontWeight: 800, letterSpacing: -2.5, lineHeight: 1 }}>humi</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ fontSize: 74, fontWeight: 800, lineHeight: 1.04, letterSpacing: -2.5, maxWidth: 1000 }}>
            Pessoas reais. Conexões reais.
          </div>
          <div style={{ fontSize: 32, fontWeight: 500, lineHeight: 1.35, color: "#6B6082", maxWidth: 980 }}>
            Converse por vídeo ou áudio com pessoas do mundo todo: bater papo, praticar idiomas, jogar e trocar experiências.
          </div>
        </div>

        <div style={{ display: "flex", gap: 16 }}>
          {["Só Conversar", "Jogar Juntos", "Explorar Culturas", "Conhecer Pessoas"].map((t) => (
            <div key={t} style={{ display: "flex", padding: "12px 24px", borderRadius: 999, background: "#FFFFFF", fontSize: 26, fontWeight: 600, color: "#493C62" }}>
              {t}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
