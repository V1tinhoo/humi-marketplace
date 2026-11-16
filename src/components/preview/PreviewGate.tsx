import Link from "next/link";
import { EyeOff } from "lucide-react";
import { Container } from "@/components/ui/primitives";
import { getT } from "@/i18n/server";
import type { PreviewStatus } from "@/lib/demo";

/** Shown instead of the preview when the visitor isn't allowed or the demo system is off. */
export async function PreviewGate({ status }: { status: PreviewStatus | null }) {
  const tr = await getT();
  const off = status?.allowed && !status.demo_enabled;
  return (
    <Container className="grid min-h-[55vh] place-items-center py-20 text-center">
      <div className="max-w-md">
        <EyeOff className="mx-auto size-8 text-plum-soft" />
        <h1 className="mt-4 text-2xl font-bold">{off ? tr("The preview is switched off") : tr("Private preview")}</h1>
        <p className="mt-2 text-plum-soft">
          {off ? tr("Demo hosts are switched off.") : tr("This area is only for HUMI admins and invited testers.")}
        </p>
        <Link href={off && status?.is_admin ? "/admin" : "/"} className="mt-6 inline-flex rounded-full bg-plum px-5 py-2.5 text-sm font-semibold text-white hover:bg-plum-deep">
          {off && status?.is_admin ? tr("Open admin") : tr("Go home")}
        </Link>
      </div>
    </Container>
  );
}
