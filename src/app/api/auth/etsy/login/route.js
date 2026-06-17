import { NextResponse } from "next/server";
import { makePkce, buildAuthorizeUrl } from "@/lib/oauth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { verifier, challenge, state } = makePkce();
    const authUrl = buildAuthorizeUrl({ challenge, state });

    const res = NextResponse.redirect(authUrl);
    // PKCE verifier + state ko short-lived httpOnly cookie me rakho.
    res.cookies.set(
      "etsy_pkce",
      JSON.stringify({ verifier, state }),
      {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 10, // 10 min
      }
    );
    return res;
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
