import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { deleteSession } from "@/lib/tokenStore";

export const dynamic = "force-dynamic";

export async function POST(request) {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("etsy_session")?.value;
  try {
    await deleteSession(sessionId);
  } catch {
    // ignore
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set("etsy_session", "", { path: "/", maxAge: 0 });
  return res;
}
