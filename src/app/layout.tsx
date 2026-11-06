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
  { href: "/lineup-setter", label: "Lineup Setter" },
  { href: "/draft", label: "Draft" },
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
          {/* Everything here is 2x the original header size on tablet/desktop. */}
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-12 gap-y-3 px-4 py-4 sm:py-6">
            <Link href="/" className="flex items-center gap-3 text-2xl font-bold tracking-tight sm:text-[32px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.webp" alt="" width={48} height={48} className="h-10 w-10 rounded-full object-cover ring-2 ring-zinc-200 sm:h-12 sm:w-12 dark:ring-zinc-700" />
              Proud Americans FPL
            </Link>
            <nav className="flex flex-wrap gap-1 font-['Times_New_Roman',Times,serif] text-lg font-bold sm:gap-2 sm:text-[28px]">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="inline-flex items-center rounded-lg px-3 py-1.5 text-zinc-600 sm:rounded-xl sm:px-5 sm:py-2 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                >
                  {n.label}
                  {n.href === "/lineup-setter" && unread > 0 && (
                    <span className="ml-2 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-emerald-600 px-1.5 text-sm font-bold text-white sm:ml-3 sm:h-8 sm:min-w-8 sm:text-[20px]">
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
