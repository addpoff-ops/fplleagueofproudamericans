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
      <body className="antialiased">
        <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <Link href="/" className="font-bold tracking-tight">
              ⚽ Proud Americans FPL
            </Link>
            <nav className="flex flex-wrap gap-1 text-sm">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="rounded-md px-2.5 py-1 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                >
                  {n.label}
                  {n.href === "/lineup-setter" && unread > 0 && (
                    <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-600 px-1 text-[10px] font-bold text-white">
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
