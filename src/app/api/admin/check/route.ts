import { NextResponse } from "next/server";
import { isAdminKey } from "@/lib/keys";

/** Confirms an admin key without changing anything. Header: x-admin-key */
export async function POST(req: Request) {
  if (!isAdminKey(req.headers.get("x-admin-key")))
    return NextResponse.json({ error: "That admin key isn't right." }, { status: 403 });
  return NextResponse.json({ ok: true });
}
