import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { prisma } from "@/lib/db";
import { currentSetter } from "@/lib/lineupSession";
import { lineupConfigured } from "@/lib/secure";

export const metadata: Metadata = {
  title: { default: "FPL League of Proud Americans", template: "%s · Proud Americans FPL" },
  description: "League hub, player rankings, and trade calculator for our Sleeper Premier League fantasy league.",
};

const NAV = [
  { href: "/power-rankings", label: "Power Rankings" },
  { href: "/matchups", label: "Matchups" },
  { href: "/rankings", label: "Player Rankings" },
  { href: "/trade", label: "Trade Calculator" },
  { href: "/season-simulator", label: "Season Simulator" },
  { href: "/lineup-setter", label: "Lineup Setter Tool" },
  { href: "/draft", label: "Draft Board" },
];

/** Unread Lineup Setter notifications for whoever is viewing (0 if not connected). */
async function unreadLineupNotices() {
  try {
    if (!lineupConfigured()) return 0;
    const setter = await currentSetter();
    return setter ? await prisma.lineupRun.count({ where: { setterId: setter.id, seen: false } }) : 0;
  } catch {
    return 0;
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const unread = await unreadLineupNotices();
  return (
    <html lang="en">
      <head>
        {/* Mulish (formerly Muli), the font Sleeper uses; for draft board names */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* In the App Router's root layout this loads on every page, so the pages-router warning doesn't apply. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Mulish:wght@700;800;900&display=swap" />
      </head>
      <body className="antialiased">
        <header className="relative z-20 border-b xl:sticky xl:top-0 border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
          {/* Wide screens (1280px+): logo + title and all tabs on one row.
              Smaller screens: title, then every tab visible at once as a grid of buttons
              (3 across on phones, 4 on tablets, 7 on small laptops). */}
          <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-5 gap-y-3 px-4 py-3 sm:py-4 xl:flex-nowrap xl:gap-x-6 xl:py-5 2xl:gap-x-8">
            <Link href="/" className="flex flex-none items-center gap-3 text-xl font-bold tracking-tight xl:text-[21px] 2xl:text-[26px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.webp" alt="" width={48} height={48} className="h-10 w-10 rounded-full object-cover ring-2 ring-zinc-200 xl:h-12 xl:w-12 dark:ring-zinc-700" />
              <span className="whitespace-nowrap">Proud Americans FPL</span>
            </Link>
            <nav className="grid w-full grid-cols-3 gap-1.5 font-['Times_New_Roman',Times,serif] text-[14px] font-bold sm:grid-cols-4 sm:text-[15px] lg:grid-cols-7 lg:text-[14px] xl:flex xl:w-auto xl:min-w-0 xl:flex-1 xl:items-center xl:gap-0.5 xl:overflow-x-auto xl:whitespace-nowrap xl:text-[15px] xl:[scrollbar-width:none] 2xl:gap-1 2xl:text-[18px]">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="inline-flex items-center justify-center rounded-lg bg-zinc-100 px-2 py-2 text-center leading-tight text-zinc-700 hover:bg-zinc-200 hover:text-zinc-900 xl:flex-none xl:justify-start xl:bg-transparent xl:px-2.5 xl:py-1.5 xl:text-left xl:text-zinc-600 2xl:px-3 dark:bg-zinc-800/70 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 xl:dark:bg-transparent xl:dark:text-zinc-400"
                >
                  {n.label}
                  {n.href === "/lineup-setter" && unread > 0 && (
                    <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-600 px-1.5 font-sans text-xs font-bold text-white xl:h-6 xl:min-w-6 xl:text-sm">
                      {unread}
                    </span>
                  )}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
