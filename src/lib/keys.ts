import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

// Each ranking set has a secret edit key. Whoever has the key (or the site's
// ADMIN_KEY) can edit that set — no accounts needed for v1.

export const newEditKey = () => randomBytes(18).toString("base64url");
export const hashKey = (key: string) => bcrypt.hash(key, 10);

export async function canEdit(key: string | null | undefined, hash: string) {
  if (!key) return false;
  const admin = process.env.ADMIN_KEY;
  if (admin && admin !== "change-me" && key === admin) return true;
  return bcrypt.compare(key, hash);
}

export function slugify(s: string) {
  const base = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
  return `${base || "rankings"}-${randomBytes(3).toString("hex")}`;
}
