import { ImageResponse } from "next/og";
import { LOGO_MARK_DATA_URI } from "@/lib/brand-image";

/** Home-screen icon (iPhone / iPad) with the real HUMI mark. */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#FFF9FC" }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- rendered to PNG by next/og */}
        <img src={LOGO_MARK_DATA_URI} width={140} height={98} alt="" />
      </div>
    ),
    size,
  );
}
