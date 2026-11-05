import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";

// Secrets for the Lineup Setter. LINEUP_SECRET encrypts stored Sleeper tokens
// and signs the browser session cookie. It must be set in Vercel's
// environment variables; without it the feature is disabled.

const secret = () => process.env.LINEUP_SECRET ?? "";
export const lineupConfigured = () => secret().length >= 16;

const key = (purpose: string) => createHash("sha256").update(`${purpose}:${secret()}`).digest();

/** AES-256-GCM. Output: base64url(iv).base64url(tag).base64url(ciphertext) */
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key("enc"), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), ct].map((b) => b.toString("base64url")).join(".");
}

export function decrypt(blob: string): string {
  const [iv, tag, ct] = blob.split(".").map((s) => Buffer.from(s, "base64url"));
  const d = createDecipheriv("aes-256-gcm", key("enc"), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]).toString("utf8");
}

/** Signed session value identifying a Sleeper user to this site. */
export function signSession(sleeperUserId: string): string {
  const mac = createHmac("sha256", key("mac")).update(sleeperUserId).digest("base64url");
  return `${sleeperUserId}.${mac}`;
}

export function verifySession(value: string | undefined | null): string | null {
  if (!value || !lineupConfigured()) return null;
  const i = value.lastIndexOf(".");
  if (i < 1) return null;
  const id = value.slice(0, i);
  const expected = Buffer.from(signSession(id).slice(i + 1));
  const given = Buffer.from(value.slice(i + 1));
  return expected.length === given.length && timingSafeEqual(expected, given) ? id : null;
}

export const SESSION_COOKIE = "lineup_session";

/** Constant-time check of the cron caller's secret. */
export function cronAuthorized(header: string | null): boolean {
  const want = process.env.CRON_SECRET;
  if (!want || !header) return false;
  const a = Buffer.from(header.replace(/^Bearer\s+/i, ""));
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}
