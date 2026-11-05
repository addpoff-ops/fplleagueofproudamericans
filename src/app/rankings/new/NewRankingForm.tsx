"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function NewRankingForm({ sets }: { sets: { slug: string; name: string; author: string }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdmin, setShowAdmin] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = Object.fromEntries(new FormData(e.currentTarget));
    const res = await fetch("/api/rankings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Something went wrong");
      setBusy(false);
      return;
    }
    try {
      localStorage.setItem(`editKey:${data.slug}`, data.editKey);
    } catch {}
    router.push(`/rankings/${data.slug}?key=${encodeURIComponent(data.editKey)}&new=1`);
  }

  return (
    <form onSubmit={onSubmit} className="card grid max-w-xl gap-4 p-5">
      <label className="grid gap-1 text-sm">
        <span className="font-medium">List name</span>
        <input name="name" required maxLength={80} placeholder="e.g. GW10 Rest-of-Season" className="input" />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Your name</span>
        <input name="author" required maxLength={40} placeholder="Your Sleeper name" className="input" />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Description <span className="text-zinc-400">(optional)</span></span>
        <textarea name="description" maxLength={500} rows={2} className="input" />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Start from</span>
        <select name="startFrom" defaultValue={sets[0]?.slug ?? "blank"} className="input">
          {sets.map((s) => (
            <option key={s.slug} value={s.slug}>
              Copy “{s.name}” by {s.author}
            </option>
          ))}
          <option value="blank">Blank list</option>
        </select>
      </label>
      {showAdmin ? (
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Admin key</span>
          <input name="adminKey" type="password" className="input" />
          <span className="text-xs text-zinc-500">Makes this the site&apos;s official rankings, replacing the current official list.</span>
        </label>
      ) : (
        <button type="button" onClick={() => setShowAdmin(true)} className="justify-self-start text-xs text-zinc-500 underline">
          Site admin?
        </button>
      )}
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <button disabled={busy} className="btn-primary justify-self-start">
        {busy ? "Creating…" : "Create rankings"}
      </button>
    </form>
  );
}
