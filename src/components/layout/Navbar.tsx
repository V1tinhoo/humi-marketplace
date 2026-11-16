"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, LayoutDashboard, LogOut, Menu, UserRound, TrendingUp, Wallet as WalletIcon, X } from "lucide-react";
import { formatBRL } from "@/lib/money";
import { useHostEarnings, useWalletBalance } from "@/lib/wallet";
import { Logo } from "@/components/brand/Logo";
import { ButtonLink } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { LanguageSwitcher, useDict, useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

export function Navbar() {
  const t = useDict();
  const tr = useT();
  const links = [
    { href: "/explore", label: t.nav.explore },
    { href: "/how-it-works", label: t.nav.howItWorks },
    { href: "/become-a-host", label: t.nav.becomeHost },
  ];
  const pathname = usePathname();
  const router = useRouter();
  const { user, ready, signOut, mode } = useAuth();
  const { balance } = useWalletBalance();
  const isHostUser = user?.role === "host" || user?.role === "admin";
  // Hosts see what they've earned (separate from a wallet: earnings are paid out, not spent).
  const earnings = useHostEarnings(mode === "supabase" && isHostUser);
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setOpen(false);
    setMenu(false);
  }, [pathname]);

  const headerRef = useRef<HTMLElement>(null);
  const [menuTop, setMenuTop] = useState(64);
  useEffect(() => {
    if (open && headerRef.current) setMenuTop(headerRef.current.getBoundingClientRect().bottom);
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const dashboardHref = user?.role === "host" ? "/dashboard" : "/account";
  const handleSignOut = () => {
    signOut();
    router.push("/");
  };

  return (
    <header
      ref={headerRef}
      className={cn(
        "sticky top-0 z-50 transition-all duration-300",
        // No backdrop-filter while the menu is open: it would make the header the containing block for the fixed overlay.
        open
          ? "bg-cream shadow-[0_1px_0_var(--color-line)]"
          : scrolled
            ? "bg-cream/85 shadow-[0_1px_0_var(--color-line)] backdrop-blur-xl"
            : "bg-transparent",
      )}
    >
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:h-[72px] lg:px-8" aria-label="Main">
        <Logo />

        <ul className="hidden items-center gap-1 md:flex">
          {links.map((l) => {
            const active = pathname.startsWith(l.href);
            return (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className={cn(
                    "relative rounded-full px-4 py-2 text-[15px] font-medium transition-colors",
                    active ? "text-plum" : "text-plum-soft hover:text-plum",
                  )}
                >
                  {l.label}
                  <span
                    className={cn(
                      "absolute inset-x-4 -bottom-0.5 h-0.5 rounded-full bg-lavender transition-transform duration-300 origin-left",
                      active ? "scale-x-100" : "scale-x-0",
                    )}
                  />
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="hidden items-center gap-2 md:flex">
          <div className="mr-1 hidden lg:block"><LanguageSwitcher /></div>
          {!ready ? (
            <div className="h-10 w-40" />
          ) : user ? (
            <>
            {mode === "supabase" && isHostUser && (
              <Link
                href="/dashboard?tab=finance"
                className="flex items-center gap-2 rounded-full bg-lilac px-3.5 py-2 text-sm font-semibold ring-1 ring-lavender/60 transition hover:bg-lavender"
                title={earnings ? tr("Earned {total} · {pending} pending", { total: formatBRL(earnings.total), pending: formatBRL(earnings.pending) }) : tr("Earnings")}
              >
                <TrendingUp className="size-4 text-plum" />
                {earnings === null ? <span className="skeleton h-4 w-14 rounded" /> : <>{formatBRL(earnings.total)} <span className="font-medium text-plum-soft">{tr("earned")}</span></>}
              </Link>
            )}
            {mode === "supabase" && !isHostUser && (
              <Link
                href="/wallet"
                className="flex items-center gap-2 rounded-full bg-white px-3.5 py-2 text-sm font-semibold ring-1 ring-line transition hover:bg-blush hover:ring-lavender"
                aria-label={tr("Wallet balance {amount}", { amount: balance === null ? "" : formatBRL(balance) })}
              >
                <WalletIcon className="size-4 text-plum-soft" />
                {balance === null ? <span className="skeleton h-4 w-14 rounded" /> : formatBRL(balance)}
              </Link>
            )}
            <div className="relative">
              <button
                onClick={() => setMenu((m) => !m)}
                className="flex items-center gap-2 rounded-full bg-white py-1 pl-1 pr-3 ring-1 ring-line transition hover:ring-lavender"
                aria-expanded={menu}
                aria-haspopup="menu"
              >
                <UserAvatar src={user.avatarUrl} name={user.name} sizes="32px" className="size-8 rounded-full" fallbackClassName="bg-lilac text-xs font-bold text-plum" />
                <span className="max-w-28 truncate text-sm font-medium">{user.name.split(" ")[0]}</span>
                <ChevronDown className={cn("size-4 transition-transform", menu && "rotate-180")} />
              </button>
              {menu && (
                <div
                  role="menu"
                  className="absolute right-0 top-12 w-56 animate-fade-up rounded-2xl bg-white p-1.5 shadow-lift ring-1 ring-line"
                >
                  <div className="px-3 py-2">
                    <p className="truncate text-sm font-semibold">{user.name}</p>
                    <p className="truncate text-xs text-plum-soft">{user.role === "host" ? tr("Host account") : tr("Member account")}{mode === "demo" ? " (demo)" : ""}</p>
                  </div>
                  <MenuLink href={dashboardHref} icon={<LayoutDashboard className="size-4" />}>
                    {user.role === "host" ? t.nav.dashboard : t.nav.account}
                  </MenuLink>
                  {mode === "supabase" && (
                    <MenuLink href="/wallet" icon={<WalletIcon className="size-4" />}>
                      {tr("Wallet")}{balance !== null ? ` · ${formatBRL(balance)}` : ""}
                    </MenuLink>
                  )}
                  {user.role === "host" && (
                    <MenuLink href="/account" icon={<UserRound className="size-4" />}>
                      {t.nav.account}
                    </MenuLink>
                  )}
                  <button
                    role="menuitem"
                    onClick={handleSignOut}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-plum hover:bg-blush"
                  >
                    <LogOut className="size-4" /> {t.nav.logout}
                  </button>
                </div>
              )}
            </div>
            </>
          ) : (
            <>
              <ButtonLink href="/login" variant="ghost" size="sm">
                {t.nav.login}
              </ButtonLink>
              <ButtonLink href="/signup" size="sm">
                {t.nav.signup}
              </ButtonLink>
            </>
          )}
        </div>

        <button
          className="grid size-10 place-items-center rounded-full text-plum transition hover:bg-lilac/60 md:hidden"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? tr("Close menu") : tr("Open menu")}
          aria-expanded={open}
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </nav>

      {/* Mobile menu — pinned right under the header, whatever sits above it */}
      <div
        style={{ top: menuTop }}
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 bg-cream transition-all duration-300 md:hidden",
          open ? "visible opacity-100" : "invisible opacity-0",
        )}
      >
        <div className={cn("flex h-full flex-col px-4 pb-8 pt-4 transition-transform duration-300", open ? "translate-y-0" : "-translate-y-3")}>
          <ul className="flex flex-col">
            {links.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="flex items-center justify-between border-b border-line py-4 text-2xl font-semibold tracking-tight"
                >
                  {l.label}
                </Link>
              </li>
            ))}
            {user && (
              <li>
                <Link href={dashboardHref} className="flex items-center justify-between border-b border-line py-4 text-2xl font-semibold tracking-tight">
                  {user.role === "host" ? t.nav.dashboard : t.nav.account}
                </Link>
              </li>
            )}
            {user && mode === "supabase" && (
              <li>
                <Link href="/wallet" className="flex items-center justify-between border-b border-line py-4 text-2xl font-semibold tracking-tight">
                  {tr("Wallet")}
                  <span className="text-base font-semibold text-plum-soft">{balance === null ? "" : formatBRL(balance)}</span>
                </Link>
              </li>
            )}
          </ul>
          <div className="mt-auto flex flex-col gap-3">
            <LanguageSwitcher className="self-center" />
            {user ? (
              <button onClick={handleSignOut} className="h-12 rounded-full bg-white font-semibold ring-1 ring-line">
                {t.nav.logout}
              </button>
            ) : (
              <>
                <ButtonLink href="/signup" size="lg">
                  {t.nav.signup}
                </ButtonLink>
                <ButtonLink href="/login" size="lg" variant="secondary">
                  {t.nav.login}
                </ButtonLink>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

function MenuLink({ href, icon, children }: { href: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link role="menuitem" href={href} className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-plum hover:bg-blush">
      {icon}
      {children}
    </Link>
  );
}
