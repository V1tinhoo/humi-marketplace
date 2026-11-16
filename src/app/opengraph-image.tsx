import { ImageResponse } from "next/og";

/** Share preview image (WhatsApp, Instagram, Telegram, X…): HUMI brand, in Portuguese. */
export const alt = "HUMI — Pessoas reais. Conexões reais.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
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
          fontFamily: "sans-serif",
        }}
      >
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ display: "flex", position: "relative", width: 96, height: 64 }}>
            <div style={{ position: "absolute", left: 0, top: 0, width: 64, height: 64, borderRadius: 64, background: "#B9A7EF" }} />
            <div style={{ position: "absolute", left: 32, top: 0, width: 64, height: 64, borderRadius: 64, background: "#E9BFD3", opacity: 0.9 }} />
            <div style={{ position: "absolute", left: 38, top: 8, width: 20, height: 48, borderRadius: 24, background: "#493C62" }} />
          </div>
          <div style={{ fontSize: 64, fontWeight: 800, letterSpacing: -2 }}>humi</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2, maxWidth: 980 }}>
            Pessoas reais. Conexões reais.
          </div>
          <div style={{ fontSize: 34, lineHeight: 1.35, color: "#6B6082", maxWidth: 960 }}>
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
    size,
  );
}
