import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { Container } from "@/components/ui/primitives";
import { getDict, getT } from "@/i18n/server";
import { LanguageSwitcher } from "@/i18n/client";
import type { Dictionary } from "@/i18n/dictionaries/en";

const columnsFor = (t: Dictionary) => [
  {
    title: t.footer.product,
    links: [
      { href: "/explore", label: t.nav.explore },
      { href: "/how-it-works", label: t.nav.howItWorks },
      { href: "/become-a-host", label: t.nav.becomeHost },
      { href: "/safety", label: t.footer.safety },
    ],
  },
  {
    title: t.footer.company,
    links: [
      { href: "/about", label: t.footer.about },
      { href: "/help", label: t.footer.help },
      { href: "/guidelines", label: t.footer.guidelines },
    ],
  },
  {
    title: t.footer.legal,
    links: [
      { href: "/terms", label: t.footer.terms },
      { href: "/privacy", label: t.footer.privacy },
      { href: "/help#cancellation", label: t.footer.cancellation },
    ],
  },
];

/* Lucide no longer ships brand marks, so simple monochrome glyphs are inlined. */
const socials = [
  {
    label: "Instagram",
    path: "M12 2.2c3.2 0 3.6 0 4.8.1 3.3.1 4.8 1.7 4.9 4.9.1 1.3.1 1.6.1 4.8s0 3.6-.1 4.8c-.1 3.2-1.7 4.8-4.9 4.9-1.3.1-1.6.1-4.8.1s-3.6 0-4.8-.1c-3.3-.1-4.8-1.7-4.9-4.9C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.8C2.4 3.9 4 2.4 7.2 2.3 8.4 2.2 8.8 2.2 12 2.2ZM12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0 8.2a3.2 3.2 0 1 1 0-6.4 3.2 3.2 0 0 1 0 6.4Zm5.2-9.6a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4Z",
  },
  {
    label: "TikTok",
    path: "M16.6 2h-3.3v13.4a2.9 2.9 0 1 1-2.9-2.9c.3 0 .6 0 .9.1V9.2a6.2 6.2 0 1 0 5.3 6.2V8.6a7.9 7.9 0 0 0 4.4 1.4V6.7a4.5 4.5 0 0 1-4.4-4.7Z",
  },
  {
    label: "X",
    path: "M17.8 3h3.1l-6.8 7.7L22 21h-6.2l-4.9-6.4L5.3 21H2.2l7.2-8.3L2 3h6.4l4.4 5.8L17.8 3Zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5Z",
  },
  {
    label: "LinkedIn",
    path: "M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9.75h4V21H3V9.75Zm6.5 0h3.8v1.6h.06c.53-1 1.84-2.05 3.79-2.05 4.05 0 4.8 2.67 4.8 6.13V21h-4v-4.94c0-1.18-.02-2.7-1.64-2.7-1.65 0-1.9 1.29-1.9 2.62V21h-4V9.75Z",
  },
];

export async function Footer() {
  const t = await getDict();
  const tr = await getT();
  const columns = columnsFor(t);
  return (
    <footer className="border-t border-line bg-white">
      <Container className="py-14 lg:py-20">
        <div className="grid gap-12 lg:grid-cols-[1.3fr_2fr]">
          <div className="max-w-sm">
            <Logo />
            <p className="mt-5 text-sm leading-relaxed text-plum-soft">{t.footer.blurb}</p>
            <div className="mt-6 flex gap-2">
              {socials.map((s) => (
                <a
                  key={s.label}
                  href="#"
                  aria-label={tr("HUMI on {network} (coming soon)", { network: s.label })}
                  className="grid size-10 place-items-center rounded-full bg-cream text-plum ring-1 ring-line transition hover:-translate-y-0.5 hover:bg-lilac"
                >
                  <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden>
                    <path d={s.path} />
                  </svg>
                </a>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            {columns.map((col) => (
              <div key={col.title}>
                <h3 className="text-sm font-semibold text-plum">{col.title}</h3>
                <ul className="mt-4 space-y-3">
                  {col.links.map((l) => (
                    <li key={l.href}>
                      <Link href={l.href} className="text-sm text-plum-soft transition-colors hover:text-plum">
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-14 flex flex-col gap-4 border-t border-line pt-8 text-xs leading-relaxed text-plum-soft lg:flex-row lg:items-start lg:justify-between">
          <p className="max-w-3xl">{t.footer.disclaimer}</p>
          <div className="flex shrink-0 flex-col items-start gap-3 lg:items-end">
            <LanguageSwitcher />
            <p>© {new Date().getFullYear()} HUMI · {tr("Beta preview · 18+ only")}</p>
          </div>
        </div>
      </Container>
    </footer>
  );
}
