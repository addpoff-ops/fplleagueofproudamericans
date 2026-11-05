"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

interface Run {
  id: string;
  week: number;
  blockStart: string;
  status: string;
  message: string;
  seen: boolean;
  createdAt: string;
}
interface Props {
  setter: { displayName: string; teamName: string | null; enabled: boolean; tokenOk: boolean } | null;
  runs: Run[];
  priorities: Record<string, string>;
}

// Copies the Sleeper session token from sleeper.com (run it while on a sleeper.com/leagues page).
const BOOKMARKLET =
  "javascript:(()=>{const t=localStorage.getItem('token');if(!t){alert('No Sleeper sign-in found on this page. Open sleeper.com/leagues, sign in, then try again.');return}navigator.clipboard.writeText(t).then(()=>alert('Copied your Sleeper sign-in token. Paste it into Lineup Setter.'),()=>prompt('Copy your Sleeper sign-in token:',t))})()";

const fmtWindow = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

const STATUS: Record<string, { label: string; cls: string }> = {
  changed: { label: "Lineup updated", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300" },
  no_change: { label: "All starting", cls: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" },
  unresolved: { label: "Needs you", cls: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300" },
  error: { label: "Error", cls: "bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300" },
  preview: { label: "Preview", cls: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300" },
};

export default function LineupSetterClient({ setter, runs, priorities }: Props) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="grid content-start gap-6">
        {setter ? <Connected setter={setter} runs={runs} /> : <ConnectForm />}
      </div>
      <aside className="grid content-start gap-4 text-sm">
        <div className="card p-4">
          <h2 className="mb-2 font-semibold">How it works</h2>
          <ol className="list-decimal space-y-1.5 pl-4 text-zinc-600 dark:text-zinc-400">
            <li>Every few minutes, the site checks whether Premier League team sheets are out for the next kickoff window.</li>
            <li>Any of your starters in that window who isn&apos;t in their club&apos;s starting XI gets benched.</li>
            <li>
              Their replacement is the best eligible bench player, in this order:
              <ul className="mt-1 list-none space-y-0.5">
                {Object.entries(priorities).map(([k, v]) => (
                  <li key={k}>
                    <b>{k}.</b> {v}
                  </li>
                ))}
              </ul>
              Ties go to the higher projection. Players whose games have kicked off are locked and never moved.
            </li>
            <li>Every change shows up here as a notification.</li>
          </ol>
        </div>
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-200">
          <h2 className="mb-1 font-semibold">Please read</h2>
          <p>
            Sleeper has no official way for other sites to change lineups. This uses the same private connection
            Sleeper&apos;s own app uses, so it could stop working if Sleeper changes their app, and it may go against
            Sleeper&apos;s terms. The site never sees your Sleeper password; only your sign-in token is stored, encrypted.
            You can disconnect at any time, which deletes it.
          </p>
        </div>
      </aside>
    </div>
  );
}

function ConnectForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agree, setAgree] = useState(false);
  // React blocks javascript: URLs in JSX, so set the bookmarklet's href directly.
  const bookmarklet = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    bookmarklet.current?.setAttribute("href", BOOKMARKLET);
  }, []);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = Object.fromEntries(new FormData(e.currentTarget));
    const res = await fetch("/api/lineup-setter/connect", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="card grid gap-4 p-5">
      <div>
        <h2 className="font-semibold">Connect your Sleeper account</h2>
        <p className="mt-1 text-sm text-zinc-500">This confirms you manage a team in this league and lets the site set your lineup.</p>
      </div>
      <ol className="list-decimal space-y-1 pl-4 text-sm text-zinc-600 dark:text-zinc-400">
        <li>
          On a computer, drag this button to your bookmarks bar:{" "}
          <a
            ref={bookmarklet}
            onClick={(e) => e.preventDefault()}
            className="inline-block rounded-md bg-emerald-600 px-2 py-0.5 text-xs font-semibold text-white"
          >
            Copy Sleeper token
          </a>
        </li>
        <li>
          Open <b>sleeper.com/leagues</b> and sign in as usual.
        </li>
        <li>Click the bookmark. It copies your sign-in token.</li>
        <li>Paste it below.</li>
      </ol>
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Sleeper sign-in token</span>
        <textarea name="token" required rows={3} className="input font-mono text-xs" />
      </label>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5" />
        <span>I understand this uses an unofficial connection to Sleeper and lets this site change my lineup.</span>
      </label>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <button disabled={busy || !agree} className="btn-primary justify-self-start">
        {busy ? "Connecting…" : "Connect"}
      </button>
    </form>
  );
}

function Connected({ setter, runs }: { setter: NonNullable<Props["setter"]>; runs: Run[] }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(setter.enabled);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ week: number; results: { windowStart: number; status: string; message: string }[]; nextKickoff: number | null } | null>(null);
  const unseen = runs.filter((r) => !r.seen).length;

  useEffect(() => {
    if (unseen) fetch("/api/lineup-setter/seen", { method: "POST" });
  }, [unseen]);

  async function toggle() {
    setBusy("toggle");
    setError(null);
    const res = await fetch("/api/lineup-setter/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: !enabled }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (res.ok) setEnabled(data.enabled);
    else setError(data.error ?? "Couldn't change the setting.");
  }

  async function run(dryRun: boolean) {
    setBusy(dryRun ? "preview" : "run");
    setError(null);
    setResult(null);
    const res = await fetch("/api/lineup-setter/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dryRun }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return setError(data.error ?? "Check failed.");
    setResult(data);
    if (!dryRun) router.refresh();
  }

  async function disconnect() {
    if (!confirm("Disconnect your Sleeper account? This deletes your saved sign-in and history here.")) return;
    await fetch("/api/lineup-setter/disconnect", { method: "POST" });
    router.refresh();
  }

  return (
    <>
      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-lg font-semibold">{setter.teamName ?? "Your team"}</div>
            <div className="text-sm text-zinc-500">
              Connected as @{setter.displayName} ·{" "}
              {setter.tokenOk ? (
                <span className="text-emerald-600">Sleeper sign-in OK</span>
              ) : (
                <span className="text-rose-600">Sign-in expired — reconnect below</span>
              )}
            </div>
          </div>
          <button
            onClick={toggle}
            disabled={busy !== null || (!setter.tokenOk && !enabled)}
            role="switch"
            aria-checked={enabled}
            className="flex items-center gap-3"
          >
            <span className="text-sm font-semibold">Lineup Setter</span>
            <span className={`relative h-7 w-12 rounded-full transition-colors ${enabled ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-700"}`}>
              <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${enabled ? "left-[22px]" : "left-0.5"}`} />
            </span>
            <span className={`w-8 text-sm font-bold ${enabled ? "text-emerald-600" : "text-zinc-500"}`}>{enabled ? "On" : "Off"}</span>
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 border-t border-zinc-100 pt-4 dark:border-zinc-800">
          <button onClick={() => run(true)} disabled={busy !== null || !setter.tokenOk} className="btn-ghost">
            {busy === "preview" ? "Checking…" : "Preview changes"}
          </button>
          <button onClick={() => run(false)} disabled={busy !== null || !setter.tokenOk} className="btn-primary">
            {busy === "run" ? "Updating…" : "Check & update now"}
          </button>
          <button onClick={disconnect} className="btn-ghost ml-auto text-rose-600">
            Disconnect
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
        {result && (
          <div className="mt-3 rounded-lg bg-zinc-50 p-3 text-sm dark:bg-zinc-950/50">
            {result.results.length === 0 ? (
              <p>
                No team sheets are out yet for GW{result.week}.
                {result.nextKickoff && <> Next kickoff: {fmtWindow(new Date(result.nextKickoff).toISOString())}. Team sheets usually drop about an hour before.</>}
              </p>
            ) : (
              <ul className="space-y-2">
                {result.results.map((r, i) => (
                  <li key={i}>
                    <StatusPill status={r.status} /> <span className="text-zinc-500">{fmtWindow(new Date(r.windowStart).toISOString())}:</span>{" "}
                    {r.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {!setter.tokenOk && (
          <div className="mt-4">
            <ConnectForm />
          </div>
        )}
      </div>

      <div className="card">
        <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
          <h2 className="font-semibold">Notifications</h2>
          {unseen > 0 && <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-bold text-white">{unseen} new</span>}
        </div>
        {runs.length === 0 ? (
          <p className="p-4 text-sm text-zinc-500">Nothing yet. Changes Lineup Setter makes will be listed here.</p>
        ) : (
          <ul>
            {runs.map((r) => (
              <li key={r.id} className={`border-b border-zinc-100 px-4 py-3 text-sm last:border-0 dark:border-zinc-800 ${!r.seen ? "bg-emerald-50/60 dark:bg-emerald-950/20" : ""}`}>
                <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                  <StatusPill status={r.status} />
                  <span>GW{r.week} · kickoff {fmtWindow(r.blockStart)}</span>
                  <span className="ml-auto">{fmtWindow(r.createdAt)}</span>
                </div>
                {r.message}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function StatusPill({ status }: { status: string }) {
  const s = STATUS[status] ?? STATUS.no_change;
  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${s.cls}`}>{s.label}</span>;
}
