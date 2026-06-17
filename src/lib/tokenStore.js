// Per-account Etsy token storage in Postgres, with automatic refresh.
import crypto from "node:crypto";
import { query, ensureSchema } from "./db";
import { refreshAccessToken } from "./oauth";
import { getMe, getShop } from "./etsy";

// Refresh if token expires within this many ms.
const REFRESH_MARGIN_MS = 60_000;

// epoch milliseconds (timezone-safe)
function expiryFrom(token) {
  const seconds = Number(token.expires_in) || 3600;
  return Date.now() + seconds * 1000;
}

// Save a freshly-issued token: identify the shop, upsert account, return user id.
export async function saveAccountFromToken(token) {
  await ensureSchema();

  const me = await getMe(token.access_token); // { user_id, shop_id }
  const etsyUserId = String(me.user_id ?? token.access_token.split(".")[0]);

  let shopId = me.shop_id ?? null;
  let shopName = null;
  if (shopId) {
    try {
      const shop = await getShop(shopId, token.access_token);
      shopName = shop?.shop_name ?? null;
    } catch {
      // shop name optional
    }
  }

  await query(
    `INSERT INTO etsy_account
       (etsy_user_id, shop_id, shop_name, access_token, refresh_token, expires_at, scopes, updated_at)
     VALUES (?,?,?,?,?,?,?, NOW())
     ON DUPLICATE KEY UPDATE
       shop_id = VALUES(shop_id),
       shop_name = VALUES(shop_name),
       access_token = VALUES(access_token),
       refresh_token = VALUES(refresh_token),
       expires_at = VALUES(expires_at),
       scopes = VALUES(scopes),
       updated_at = NOW()`,
    [
      etsyUserId,
      shopId,
      shopName,
      token.access_token,
      token.refresh_token,
      expiryFrom(token),
      token.token_type || null,
    ]
  );

  return { etsyUserId, shopId, shopName };
}

export async function createSession(etsyUserId) {
  await ensureSchema();
  const sessionId = crypto.randomBytes(24).toString("hex");
  await query(
    `INSERT INTO app_session (session_id, etsy_user_id) VALUES (?,?)`,
    [sessionId, etsyUserId]
  );
  return sessionId;
}

export async function deleteSession(sessionId) {
  if (!sessionId) return;
  await ensureSchema();
  await query(`DELETE FROM app_session WHERE session_id = ?`, [sessionId]);
}

async function getAccountBySession(sessionId) {
  await ensureSchema();
  const { rows } = await query(
    `SELECT a.* FROM app_session s
       JOIN etsy_account a ON a.etsy_user_id = s.etsy_user_id
      WHERE s.session_id = ?`,
    [sessionId]
  );
  return rows[0] || null;
}

// Returns a valid (auto-refreshed) access token + shop info for a session,
// or null if the session has no linked account.
export async function getValidAccessToken(sessionId) {
  if (!sessionId) return null;
  const acc = await getAccountBySession(sessionId);
  if (!acc) return null;

  const expiresAt = Number(acc.expires_at);
  if (expiresAt - Date.now() > REFRESH_MARGIN_MS) {
    return {
      accessToken: acc.access_token,
      shopId: acc.shop_id,
      shopName: acc.shop_name,
    };
  }

  // Expired/near-expiry -> refresh and persist.
  const fresh = await refreshAccessToken(acc.refresh_token);
  await query(
    `UPDATE etsy_account SET
        access_token = ?,
        refresh_token = ?,
        expires_at = ?,
        updated_at = NOW()
      WHERE etsy_user_id = ?`,
    [
      fresh.access_token,
      fresh.refresh_token || acc.refresh_token,
      expiryFrom(fresh),
      acc.etsy_user_id,
    ]
  );
  return {
    accessToken: fresh.access_token,
    shopId: acc.shop_id,
    shopName: acc.shop_name,
  };
}
