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
        <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
          {/* One row: logo + title, then the tabs. Tabs scale with screen width and
              scroll sideways on narrow screens instead of wrapping. */}
          <div className="mx-auto flex max-w-[1500px] items-center gap-x-5 px-4 py-4 sm:py-5 xl:gap-x-8">
            <Link href="/" className="flex flex-none items-center gap-3 text-xl font-bold tracking-tight lg:text-lg xl:text-[24px] 2xl:text-[28px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.webp" alt="" width={48} height={48} className="h-10 w-10 rounded-full object-cover ring-2 ring-zinc-200 xl:h-12 xl:w-12 dark:ring-zinc-700" />
              <span className="whitespace-nowrap">Proud Americans FPL</span>
            </Link>
            <nav className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto whitespace-nowrap font-['Times_New_Roman',Times,serif] text-[15px] font-bold [scrollbar-width:none] lg:text-[14px] xl:gap-1 xl:text-[17px] 2xl:text-[20px]">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="inline-flex flex-none items-center rounded-lg px-2 py-1.5 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 xl:px-3 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
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
        <footer className="mx-auto max-w-6xl px-4 pb-8 text-xs text-zinc-500">
          League data from the Sleeper API.
        </footer>
      </body>
    </html>
  );
}
