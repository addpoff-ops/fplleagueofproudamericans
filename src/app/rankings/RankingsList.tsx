"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { RankingSetSummary } from "@/lib/rankings";

const KEY_STORAGE = "adminKey";

/** Rankings cards, plus an admin mode (site ADMIN_KEY) that can delete lists. */
export default function RankingsList({ sets }: { sets: RankingSetSummary[] }) {
  const router = useRouter();
  const [adminKey, setAdminKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    try {
      setAdminKey(sessionStorage.getItem(KEY_STORAGE));
    } catch {}
  }, []);

  async function unlock() {
    const key = prompt("Admin key:");
    if (!key) return;
    const res = await fetch("/api/admin/check", { method: "POST", headers: { "x-admin-key": key } });
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error ?? "That admin key isn't right.");
    setError(null);
    setAdminKey(key);
    try {
      sessionStorage.setItem(KEY_STORAGE, key);
    } catch {}
  }

  function lock() {
    setAdminKey(null);
    try {
      sessionStorage.removeItem(KEY_STORAGE);
    } catch {}
  }

  async function remove(s: RankingSetSummary) {
    if (!adminKey || !confirm(`Delete “${s.name}” by ${s.author}? This can't be undone.`)) return;
    setBusy(s.slug);
    setError(null);
    const res = await fetch(`/api/rankings/${s.slug}`, { method: "DELETE", headers: { "x-edit-key": adminKey } });
    setBusy(null);
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error ?? "Couldn't delete that list.");
    router.refresh();
  }

  return (
    <>
      <div className="mb-3 flex items-center justify-end gap-3 text-sm">
        {error && <span className="text-rose-600">{error}</span>}
        {adminKey ? (
          <>
            <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
              Admin mode
            </span>
            <button onClick={lock} className="btn-ghost">
              Exit admin
            </button>
          </>
        ) : (
          <button onClick={unlock} className="text-xs text-zinc-500 underline">
            Admin
          </button>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {sets.map((s) => (
          <div key={s.slug} className="card relative p-4 hover:border-emerald-500">
            <Link href={`/rankings/${s.slug}`} prefetch={false} className="block">
              <div className="flex items-center gap-2 pr-16">
                <span className="font-semibold">{s.name}</span>
              </div>
              <div className="mt-0.5 text-xs text-zinc-500">
                by {s.author} · {s.count} players · updated {new Date(s.updatedAt).toLocaleDateString()}
              </div>
              {s.description && <p className="mt-2 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">{s.description}</p>}
            </Link>
            {adminKey && !s.isOfficial && (
              <button
                onClick={() => remove(s)}
                disabled={busy === s.slug}
                className="btn-ghost absolute right-3 top-3 py-1 text-xs text-rose-600"
              >
                {busy === s.slug ? "Deleting…" : "Delete"}
              </button>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
