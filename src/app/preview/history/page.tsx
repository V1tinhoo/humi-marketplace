import { Container } from "@/components/ui/primitives";
import { DemoCallHistory } from "@/components/preview/DemoCallHistory";
import { getPreviewHosts } from "@/lib/preview-server";
import { getT } from "@/i18n/server";

export const dynamic = "force-dynamic";

export default async function PreviewHistoryPage() {
  const [hosts, tr] = await Promise.all([getPreviewHosts(), getT()]);
  return (
    <Container className="pb-24 pt-10">
      <h1 className="text-3xl font-extrabold tracking-tight">{tr("Your test calls")}</h1>
      <p className="mt-1 text-plum-soft">{tr("Simulated calls with demo hosts, with the host / HUMI split of each one.")}</p>
      <div className="mt-6">
        <DemoCallHistory hosts={hosts.map((h) => ({ id: h.id, name: h.display_name }))} />
      </div>
    </Container>
  );
}
