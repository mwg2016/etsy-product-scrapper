import { NextResponse } from "next/server";
import { exchangeCodeForToken } from "@/lib/oauth";
import { saveAccountFromToken, createSession } from "@/lib/tokenStore";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const oauthError = searchParams.get("error");

  const home = new URL("/", request.url);

  if (oauthError) {
    home.searchParams.set("auth_error", oauthError);
    return NextResponse.redirect(home);
  }
  if (!code) {
    home.searchParams.set("auth_error", "missing_code");
    return NextResponse.redirect(home);
  }

  // PKCE cookie padho
  const pkceRaw = request.cookies.get("etsy_pkce")?.value;
  if (!pkceRaw) {
    home.searchParams.set("auth_error", "pkce_cookie_missing");
    return NextResponse.redirect(home);
  }

  let verifier, savedState;
  try {
    ({ verifier, state: savedState } = JSON.parse(pkceRaw));
  } catch {
    home.searchParams.set("auth_error", "pkce_cookie_corrupt");
    return NextResponse.redirect(home);
  }

  if (!savedState || savedState !== state) {
    home.searchParams.set("auth_error", "state_mismatch");
    return NextResponse.redirect(home);
  }

  try {
    const token = await exchangeCodeForToken({ code, verifier });
    // Token DB me save karo aur is browser ke liye session banao.
    const { etsyUserId } = await saveAccountFromToken(token);
    const sessionId = await createSession(etsyUserId);

    home.searchParams.set("connected", "1");
    const res = NextResponse.redirect(home);
    res.cookies.set("etsy_session", sessionId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 90, // 90 din
    });
    res.cookies.set("etsy_pkce", "", { path: "/", maxAge: 0 });
    return res;
  } catch (e) {
    home.searchParams.set("auth_error", encodeURIComponent(e.message));
    return NextResponse.redirect(home);
  }
}
