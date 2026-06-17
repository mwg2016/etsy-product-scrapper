// Etsy OAuth 2.0 (Authorization Code + PKCE) helpers.
import crypto from "node:crypto";
import { getKeystring } from "./etsy";

export const AUTHORIZE_URL = "https://www.etsy.com/oauth/connect";
export const TOKEN_URL = "https://api.etsy.com/v3/public/oauth/token";
// listings_r -> active listings + inventory read access
export const SCOPES = "listings_r";

export function redirectUri() {
  return (
    process.env.ETSY_REDIRECT_URI ||
    "http://localhost:3000/api/auth/etsy/callback"
  );
}

function base64url(buf) {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function makePkce() {
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(
    crypto.createHash("sha256").update(verifier).digest()
  );
  const state = base64url(crypto.randomBytes(16));
  return { verifier, challenge, state };
}

export function buildAuthorizeUrl({ challenge, state }) {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", getKeystring());
  url.searchParams.set("redirect_uri", redirectUri());
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

async function postToken(body) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      `Token request failed (${res.status}): ${
        data.error_description || data.error || JSON.stringify(data)
      }`
    );
  }
  return data; // { access_token, token_type, expires_in, refresh_token }
}

export async function exchangeCodeForToken({ code, verifier }) {
  return postToken(
    new URLSearchParams({
      grant_type: "authorization_code",
      client_id: getKeystring(),
      redirect_uri: redirectUri(),
      code,
      code_verifier: verifier,
    })
  );
}

export async function refreshAccessToken(refreshToken) {
  return postToken(
    new URLSearchParams({
      grant_type: "refresh_token",
      client_id: getKeystring(),
      refresh_token: refreshToken,
    })
  );
}
