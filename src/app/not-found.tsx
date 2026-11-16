import { Compass } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { Container } from "@/components/ui/primitives";
import { getT } from "@/i18n/server";

export default async function NotFound() {
  const tr = await getT();
  return (
    <Container className="grid min-h-[60vh] place-items-center py-24 text-center">
      <div>
        <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-lilac">
          <Compass className="size-7" strokeWidth={1.75} />
        </span>
        <h1 className="mt-6 text-4xl font-extrabold tracking-tight">{tr("We couldn't find that page.")}</h1>
        <p className="mx-auto mt-3 max-w-md text-plum-soft">{tr("It may have moved, or the link might be off by a letter. Plenty of good conversations elsewhere, though.")}</p>
        <div className="mt-8 flex justify-center gap-3">
          <ButtonLink href="/explore">{tr("Explore hosts")}</ButtonLink>
          <ButtonLink href="/" variant="secondary">{tr("Go home")}</ButtonLink>
        </div>
      </div>
    </Container>
  );
}
