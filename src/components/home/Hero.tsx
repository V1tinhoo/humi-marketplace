import { ArrowRight, Gamepad2, Globe2, Mic, Video } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { Container } from "@/components/ui/primitives";
import { HostPhoto } from "@/components/hosts/HostBits";
import { getHost } from "@/data/hosts";
import { getDict, getT } from "@/i18n/server";

export async function Hero() {
  const t = await getDict();
  const tr = await getT();
  const [a, b, c, d] = ["sophie", "alex", "amara", "walter"].map((id) => getHost(id)!);

  return (
    <section className="relative overflow-hidden">
      {/* Soft brand backdrop */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -right-40 -top-40 size-[640px] rounded-full bg-lilac blur-3xl opacity-70" />
        <div className="absolute -left-32 top-64 size-[520px] rounded-full bg-blush blur-3xl" />
      </div>

      <Container className="grid items-center gap-12 pb-16 pt-10 lg:grid-cols-[1.05fr_1fr] lg:gap-8 lg:pb-28 lg:pt-16">
        <div className="min-w-0 animate-fade-up">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/80 py-1.5 pl-1.5 pr-4 text-sm font-medium text-plum ring-1 ring-line backdrop-blur">
            <span className="rounded-full bg-lavender px-2.5 py-0.5 text-xs font-semibold text-plum-deep">{tr("New")}</span>
            {t.hero.eyebrow}
          </p>
          <h1 className="mt-6 text-balance text-[2.6rem] font-extrabold leading-[1.02] tracking-[-0.035em] text-plum sm:text-6xl lg:text-[4.4rem]">
            {tr("The world is full of people")}{" "}
            {/* Wraps freely (Portuguese is longer); the rose underline follows every line. */}
            <span className="bg-[linear-gradient(var(--color-rose),var(--color-rose))] bg-[length:100%_0.16em] bg-[position:0_94%] bg-no-repeat [box-decoration-break:clone] [-webkit-box-decoration-break:clone]">
              {tr("worth talking to.")}
            </span>
          </h1>
          <p className="mt-6 max-w-xl text-pretty text-lg leading-relaxed text-plum-soft sm:text-xl">{t.hero.body}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <ButtonLink href="/explore" size="lg">
              {t.hero.primary} <ArrowRight className="size-4" />
            </ButtonLink>
            <ButtonLink href="/become-a-host" size="lg" variant="secondary">
              {t.hero.secondary}
            </ButtonLink>
          </div>
          <ul className="mt-10 flex flex-wrap gap-x-6 gap-y-3 text-sm text-plum-soft">
            <li className="flex items-center gap-2"><Mic className="size-4 text-plum" /> {tr("Audio or video")}</li>
            <li className="flex items-center gap-2"><Globe2 className="size-4 text-plum" /> {tr("Hosts around the world")}</li>
            <li className="flex items-center gap-2"><Gamepad2 className="size-4 text-plum" /> {tr("Talk, play or practice")}</li>
          </ul>
        </div>

        {/* Portrait collage */}
        <div className="relative mx-auto h-[440px] w-full max-w-[520px] sm:h-[520px]" aria-label={tr("Sample host portraits")}>
          {/* connection line */}
          <svg aria-hidden viewBox="0 0 520 520" className="absolute inset-0 size-full text-lavender">
            <path d="M120 120 C 260 60, 330 200, 400 150 S 420 380, 300 400 S 120 420, 150 300" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="2 8" strokeLinecap="round" />
          </svg>

          <figure className="absolute left-0 top-6 w-[44%] animate-float [animation-delay:-1s]">
            <HostPhoto src={a.photo} name={a.firstName} priority sizes="240px" className="aspect-[3/4] rounded-[28px] shadow-lift ring-4 ring-white" />
          </figure>
          <figure className="absolute right-0 top-0 w-[40%] animate-float [animation-delay:-3s]">
            <HostPhoto src={b.photo} name={b.firstName} priority sizes="220px" className="aspect-[3/4] rounded-[28px] shadow-lift ring-4 ring-white" />
          </figure>
          <figure className="absolute bottom-0 left-[14%] w-[36%] animate-float [animation-delay:-2s]">
            <HostPhoto src={c.photo} name={c.firstName} sizes="200px" className="aspect-square rounded-full shadow-lift ring-4 ring-white" />
          </figure>
          <figure className="absolute bottom-10 right-[6%] w-[38%] animate-float [animation-delay:-4s]">
            <HostPhoto src={d.photo} name={d.firstName} sizes="200px" className="aspect-[4/5] rounded-[28px] shadow-lift ring-4 ring-white" />
          </figure>

          {/* floating UI chips */}
          <div className="absolute left-[6%] top-[44%] z-10 flex max-w-[88%] items-center gap-3 sm:left-[30%] sm:max-w-none rounded-2xl bg-white/95 p-2.5 pr-4 shadow-lift ring-1 ring-line backdrop-blur">
            <span className="grid size-9 place-items-center rounded-xl bg-lavender text-plum-deep">
              <Video className="size-4" />
            </span>
            <div className="leading-tight">
              <p className="text-sm font-semibold text-plum">{tr("Video · 30 min")}</p>
              <p className="text-xs text-plum-soft">{tr("Travel stories with Sophie")}</p>
            </div>
          </div>
          <div className="absolute bottom-[2%] right-0 z-10 hidden rounded-2xl bg-plum px-4 py-3 text-white shadow-lift sm:block">
            <p className="text-xs text-white/70">{tr("Speaking")}</p>
            <p className="text-sm font-semibold">{tr("Portuguese · English")}</p>
          </div>
          <div className="absolute bottom-[38%] left-[-2%] z-10 rounded-full bg-blush px-3.5 py-2 text-xs font-semibold text-plum shadow-soft ring-1 ring-white">
            &ldquo;{tr("Best chat of my week")}&rdquo;
          </div>
        </div>
      </Container>
    </section>
  );
}
