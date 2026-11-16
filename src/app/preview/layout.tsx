import type { Metadata } from "next";
import { PreviewBar } from "@/components/preview/PreviewBar";
import { PreviewGate } from "@/components/preview/PreviewGate";
import { getPreviewStatus } from "@/lib/preview-server";

// Private: never indexed, always rendered for the signed-in user.
export const metadata: Metadata = { title: "Preview", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function PreviewLayout({ children }: { children: React.ReactNode }) {
  const status = await getPreviewStatus();
  if (!status?.allowed || !status.demo_enabled) return <PreviewGate status={status} />;
  return (
    <>
      <PreviewBar isAdmin={status.is_admin} balance={status.balance_cents ?? 0} callsEnabled={status.calls_enabled} />
      {children}
    </>
  );
}
